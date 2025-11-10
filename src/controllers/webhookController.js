/**
 * Webhook Controller
 * معالجة webhooks من ClickUp
 */

import logger from '../core/logger.js';
import eventBus, { EVENTS } from '../core/eventBus.js';
import clickupService from '../services/clickup/clickupService.js';
import productivityRepo from '../repositories/productivityRepository.js';
import gamificationService from '../services/gamification/gamificationService.js';
import { TASK_STATUS } from '../config/constants.js';
import { findMemberById, findMemberByEmail } from '../config/team.js';
import { TASK_CATEGORIES } from '../config/constants.js';

/**
 * Analyze task category
 * @param {Object} task - Task object
 * @returns {Array} Array of categories
 */
function analyzeTaskCategory(task) {
  const taskText = `${task.name} ${task.description || ''}`.toLowerCase();
  const detectedCategories = [];

  for (const [category, keywords] of Object.entries(TASK_CATEGORIES)) {
    if (keywords.some(keyword => taskText.includes(keyword))) {
      detectedCategories.push(category);
    }
  }

  return detectedCategories.length > 0 ? detectedCategories : ['عام'];
}

/**
 * Handle task created webhook
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleTaskCreated(req, res) {
  try {
    const body = JSON.parse(req.body.toString('utf8'));
    const taskId = body.task_id || body.payload?.id;

    if (!taskId) {
      logger.warn('Task created webhook without task ID');
      return res.status(400).json({ error: 'Missing task ID' });
    }

    logger.info('Task created webhook received', { taskId });

    // Get full task details
    const task = await clickupService.getTask(taskId);

    if (!task) {
      logger.warn('Task not found', { taskId });
      return res.status(404).json({ error: 'Task not found' });
    }

    // Extract assignees with team member info
    const assignees = (task.assignees || []).map(assignee => {
      const member = findMemberById(assignee.id) || findMemberByEmail(assignee.email);
      return {
        id: assignee.id,
        email: assignee.email,
        username: assignee.username,
        name: member?.name || assignee.username,
        phone: member?.phone
      };
    }).filter(a => a.phone); // Only those with phone numbers

    // Emit task created event
    eventBus.emitEvent(EVENTS.TASK_CREATED, {
      task,
      assignees
    });

    logger.success('Task created event emitted', {
      taskId: task.id,
      assignees: assignees.length
    });

    res.status(200).json({ success: true, taskId: task.id });
  } catch (error) {
    logger.error('Error handling task created webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle task updated webhook
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleTaskUpdated(req, res) {
  try {
    const body = JSON.parse(req.body.toString('utf8'));
    const taskId = body.task_id || body.payload?.id;
    const historyItem = body.history_items?.[0];

    if (!taskId) {
      logger.warn('Task updated webhook without task ID');
      return res.status(400).json({ error: 'Missing task ID' });
    }

    if (!historyItem) {
      logger.debug('Task updated without history item', { taskId });
      return res.status(200).json({ success: true, message: 'No history item' });
    }

    logger.info('Task updated webhook received', {
      taskId,
      field: historyItem.field
    });

    // Get full task details
    const task = await clickupService.getTask(taskId);

    if (!task) {
      logger.warn('Task not found', { taskId });
      return res.status(404).json({ error: 'Task not found' });
    }

    const updaterName = historyItem.user?.username || 'Unknown';

    // Handle different update types
    switch (historyItem.field) {
      case 'status': {
        const beforeStatus = historyItem.before?.status || 'Unknown';
        const afterStatus = task.status?.status || 'Unknown';
        const isComplete = TASK_STATUS.NON_OPEN.includes(afterStatus.toLowerCase().trim());

        logger.debug('Task status changed', {
          taskId,
          before: beforeStatus,
          after: afterStatus,
          isComplete
        });

        if (isComplete) {
          // Task completed - save productivity data
          const categories = analyzeTaskCategory(task);

          await productivityRepo.addEntry({
            type: 'task_completed',
            taskId: task.id,
            userId: updaterName,
            timestamp: Date.now(),
            isSubtask: !!task.parent,
            parentId: task.parent || null,
            categories,
            taskName: task.name,
            taskDescription: task.description || ''
          });

          // Emit task completed event
          eventBus.emitEvent(EVENTS.TASK_COMPLETED, {
            task,
            userName: updaterName
          });

          // 🎮 Process gamification (badges, shields, points)
          // Try to get user ID from assignees or updater
          let userId = null;
          if (task.assignees && task.assignees.length > 0) {
            userId = task.assignees[0].id; // First assignee
          } else if (historyItem.user) {
            // Try to find by email/username
            const member = findMemberByEmail(historyItem.user.email);
            userId = member?.id;
          }

          if (userId) {
            try {
              const gamificationResult = await gamificationService.processCompletedTask(task, userId);
              logger.success('Gamification processed', {
                taskId: task.id,
                userId,
                pointsEarned: gamificationResult?.pointsEarned,
                newBadges: gamificationResult?.newBadges?.length || 0
              });
            } catch (gamError) {
              logger.error('Gamification failed', {
                error: gamError.message,
                taskId: task.id,
                userId
              });
            }
          } else {
            logger.warn('Cannot process gamification: user ID not found', { taskId: task.id });
          }

          logger.success('Task completed event emitted', {
            taskId: task.id,
            userName: updaterName
          });
        } else {
          // Just status changed
          eventBus.emitEvent(EVENTS.TASK_STATUS_CHANGED, {
            task,
            beforeStatus,
            afterStatus,
            userName: updaterName
          });
        }
        break;
      }

      case 'assignee': {
        // Extract assignees
        const assignees = (task.assignees || []).map(assignee => {
          const member = findMemberById(assignee.id) || findMemberByEmail(assignee.email);
          return {
            id: assignee.id,
            email: assignee.email,
            username: assignee.username,
            name: member?.name || assignee.username,
            phone: member?.phone
          };
        }).filter(a => a.phone);

        eventBus.emitEvent(EVENTS.TASK_ASSIGNED, {
          task,
          assignees,
          userName: updaterName
        });

        logger.debug('Task assignee changed event emitted', {
          taskId: task.id,
          assignees: assignees.length
        });
        break;
      }

      default:
        logger.debug('Minor task update, no event emitted', {
          taskId,
          field: historyItem.field
        });
    }

    res.status(200).json({ success: true, taskId: task.id });
  } catch (error) {
    logger.error('Error handling task updated webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle task comment webhook
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleTaskComment(req, res) {
  try {
    const body = JSON.parse(req.body.toString('utf8'));
    const taskId = body.task_id;

    if (!taskId) {
      logger.warn('Task comment webhook without task ID');
      return res.status(400).json({ error: 'Missing task ID' });
    }

    logger.info('Task comment webhook received', { taskId });

    // Get task and comments
    const [task, comments] = await Promise.all([
      clickupService.getTask(taskId),
      clickupService.getTaskComments(taskId)
    ]);

    if (!task || !comments || comments.length === 0) {
      logger.warn('Task or comments not found', { taskId });
      return res.status(404).json({ error: 'Task or comments not found' });
    }

    const latestComment = comments[0];

    eventBus.emitEvent(EVENTS.TASK_COMMENT_ADDED, {
      task,
      comment: latestComment,
      commenterName: latestComment.user?.username || 'Unknown',
      commentText: latestComment.comment_text || ''
    });

    logger.debug('Task comment event emitted', {
      taskId: task.id,
      commenter: latestComment.user?.username
    });

    res.status(200).json({ success: true, taskId: task.id });
  } catch (error) {
    logger.error('Error handling task comment webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle sample request webhook (ERPNext integration)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleSampleRequest(req, res) {
  try {
    const body = JSON.parse(req.body.toString('utf8'));
    const { customer, items, requestNo } = body;

    if (!customer || !requestNo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    logger.info('Sample request webhook received', {
      customer,
      requestNo,
      itemCount: items?.length || 0
    });

    const listId = process.env.CLICKUP_SAMPLE_LIST_ID;

    if (!listId) {
      logger.error('CLICKUP_SAMPLE_LIST_ID not configured');
      return res.status(500).json({ error: 'Sample list not configured' });
    }

    // Create main task
    const mainTask = await clickupService.createTask(listId, {
      name: `Sample Request - ${customer} - ${requestNo}`,
      description: `طلب عينات من العميل: ${customer}\nرقم الطلب: ${requestNo}`,
      status: 'to do'
    });

    logger.success('Main task created', {
      taskId: mainTask.id,
      customer
    });

    // Create fixed subtasks
    const fixedSubtasks = [
      'Print the papers and documents',
      'Attach the labels',
      'Load the order'
    ];

    for (const subtaskName of fixedSubtasks) {
      await clickupService.createSubtask(mainTask.id, listId, {
        name: subtaskName,
        description: `Part of sample request for ${customer} - ${requestNo}`,
        status: 'to do'
      });
    }

    // Create item subtasks
    if (items && items.length > 0) {
      for (const item of items) {
        await clickupService.createSubtask(mainTask.id, listId, {
          name: `${item.item_name} (${item.item_code})`,
          description: item.description || `Item from ${customer}`,
          status: 'to do'
        });
      }
    }

    logger.success('Sample request processed', {
      mainTaskId: mainTask.id,
      subtasksCount: fixedSubtasks.length + (items?.length || 0)
    });

    res.status(200).json({
      success: true,
      taskId: mainTask.id,
      taskUrl: `https://app.clickup.com/t/${mainTask.id}`
    });
  } catch (error) {
    logger.error('Error handling sample request webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default {
  handleTaskCreated,
  handleTaskUpdated,
  handleTaskComment,
  handleSampleRequest
};
