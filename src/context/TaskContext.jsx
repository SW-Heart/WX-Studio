import React, { createContext, useContext } from 'react';
import { useTasks, TASK_STATUS } from '../hooks/useTasks';

// 创建 Context
const TaskContext = createContext(null);

/**
 * 任务管理 Provider
 * 包裹在 App 最外层，提供全局任务状态管理
 */
export const TaskProvider = ({ children }) => {
    const taskManager = useTasks();

    return (
        <TaskContext.Provider value={taskManager}>
            {children}
        </TaskContext.Provider>
    );
};

/**
 * 使用任务管理器的 Hook
 */
export const useTaskManager = () => {
    const context = useContext(TaskContext);
    if (!context) {
        throw new Error('useTaskManager must be used within a TaskProvider');
    }
    return context;
};

export { TASK_STATUS };
export default TaskContext;
