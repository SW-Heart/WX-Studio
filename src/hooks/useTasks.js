import { useState, useEffect, useCallback } from 'react';

// 任务状态常量
export const TASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    SUCCESS: 'success',
    ERROR: 'error'
};

// 生成唯一 ID
const generateTaskId = () => `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// localStorage key
const STORAGE_KEY = 'wx_studio_running_tasks';

/**
 * 全局任务管理 Hook
 * 支持并行任务执行、页面切换后状态保持
 */
export const useTasks = () => {
    const [tasks, setTasks] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const parsed = saved ? JSON.parse(saved) : [];

            // 启动时清理僵尸任务：超过5分钟仍在进行中的任务标记为失败
            const now = Date.now();
            const TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时
            return parsed.map(t => {
                if ((t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING) &&
                    (now - t.startTime > TIMEOUT_MS)) {
                    return { ...t, status: TASK_STATUS.ERROR, error: '任务超时，请重试' };
                }
                return t;
            });
        } catch {
            return [];
        }
    });

    // 同步到 localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }, [tasks]);

    // 运行时定时清理僵尸任务（每分钟检查一次）
    useEffect(() => {
        const checkTimeout = () => {
            const now = Date.now();
            const TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时

            setTasks(prev => {
                let hasChanges = false;
                const newTasks = prev.map(t => {
                    if ((t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING) &&
                        (now - t.startTime > TIMEOUT_MS)) {
                        hasChanges = true;
                        return { ...t, status: TASK_STATUS.ERROR, error: '任务超时，请重试' };
                    }
                    return t;
                });
                return hasChanges ? newTasks : prev;
            });
        };

        const interval = setInterval(checkTimeout, 60 * 1000); // 1分钟检查一次
        return () => clearInterval(interval);
    }, []);

    // 清理所有僵尸任务（手动触发）
    const clearZombieTasks = useCallback(() => {
        setTasks(prev => prev.filter(t =>
            t.status !== TASK_STATUS.PENDING && t.status !== TASK_STATUS.RUNNING
        ));
    }, []);

    // 创建新任务
    const createTask = useCallback((type, prompt, metadata = {}) => {
        const task = {
            id: generateTaskId(),
            type,
            status: TASK_STATUS.PENDING,
            prompt,
            metadata, // 额外信息（如原图 URL、模式等）
            startTime: Date.now(),
            progress: 0,
            result: null,
            error: null
        };

        setTasks(prev => [task, ...prev]);
        return task.id;
    }, []);

    // 更新任务状态
    const updateTask = useCallback((taskId, updates) => {
        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, ...updates } : t
        ));
    }, []);

    // 更新任务进度
    const updateProgress = useCallback((taskId, progress) => {
        updateTask(taskId, { progress: Math.min(progress, 99) });
    }, [updateTask]);

    // 任务完成
    const completeTask = useCallback((taskId, result) => {
        updateTask(taskId, {
            status: TASK_STATUS.SUCCESS,
            progress: 100,
            result
        });
    }, [updateTask]);

    // 任务失败
    const failTask = useCallback((taskId, error) => {
        updateTask(taskId, {
            status: TASK_STATUS.ERROR,
            error: error?.message || error || '未知错误'
        });
    }, [updateTask]);

    // 移除任务（完成后从列表移除）
    const removeTask = useCallback((taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
    }, []);

    // 获取指定类型的任务
    const getTasksByType = useCallback((type) => {
        return tasks.filter(t => t.type === type);
    }, [tasks]);

    // 获取进行中的任务
    const getRunningTasks = useCallback(() => {
        return tasks.filter(t =>
            t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING
        );
    }, [tasks]);

    // 清理已完成的任务
    const clearCompletedTasks = useCallback(() => {
        setTasks(prev => prev.filter(t =>
            t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING
        ));
    }, []);

    return {
        tasks,
        createTask,
        updateTask,
        updateProgress,
        completeTask,
        failTask,
        removeTask,
        getTasksByType,
        getRunningTasks,
        clearCompletedTasks,
        clearZombieTasks,
        TASK_STATUS
    };
};

export default useTasks;
