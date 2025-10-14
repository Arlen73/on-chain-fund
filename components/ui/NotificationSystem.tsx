'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  autoHide?: boolean;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notificationData: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const notification: Notification = {
      ...notificationData,
      id,
      timestamp: Date.now(),
      autoHide: notificationData.autoHide ?? true,
      duration: notificationData.duration ?? 100
    };

    setNotifications(prev => [notification, ...prev]);

    // Auto-remove notification after duration
    if (notification.autoHide) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, notification.duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      removeNotification,
      clearAll
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();
  
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <NotificationCard 
          key={notification.id} 
          notification={notification} 
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationCard({ 
  notification, 
  onRemove 
}: { 
  notification: Notification;
  onRemove: () => void;
}) {
  const getNotificationStyles = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-success-50 border-success-200 text-success-800';
      case 'error':
        return 'bg-danger-50 border-danger-200 text-danger-800';
      case 'warning':
        return 'bg-warning-50 border-warning-200 text-warning-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  return (
    <div className={`p-4 rounded-lg border-l-4 shadow-lg animate-slide-in ${getNotificationStyles()}`}>
      <div className="flex items-start">
        <div className="text-xl mr-3">
          {getIcon()}
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">{notification.title}</h4>
          <p className="text-sm mt-1 opacity-90">{notification.message}</p>
          {notification.action && (
            <button
              type="button"
              onClick={notification.action.onClick}
              className="mt-2 text-xs font-medium underline hover:no-underline"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="ml-4 text-gray-400 hover:text-gray-600 cursor-pointer focus:outline-none"
          aria-label="關閉通知"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Helper hooks for common notification types
export function useSuccessNotification() {
  const { addNotification } = useNotifications();
  
  return useCallback((title: string, message: string, action?: Notification['action']) => {
    return addNotification({
      type: 'success',
      title,
      message,
      action
    });
  }, [addNotification]);
}

export function useErrorNotification() {
  const { addNotification } = useNotifications();
  
  return useCallback((title: string, message: string, action?: Notification['action']) => {
    return addNotification({
      type: 'error',
      title,
      message,
      action,
      autoHide: true, // 改為自動隱藏
      duration: 8000 // 8秒後自動關閉（比成功訊息長一點）
    });
  }, [addNotification]);
}

export function useTransactionNotification() {
  const { addNotification } = useNotifications();
  
  return useCallback((
    type: 'pending' | 'success' | 'error',
    txHash?: string,
    amount?: string,
    fundName?: string
  ) => {
    let title: string, message: string, notificationType: Notification['type'];
    
    switch (type) {
      case 'pending':
        title = '交易處理中';
        message = `正在處理您的${amount ? `${amount} 元` : ''}投資交易${fundName ? ` - ${fundName}` : ''}`;
        notificationType = 'info';
        break;
      case 'success':
        title = '交易成功';
        message = `您的${amount ? `${amount} 元` : ''}投資已成功完成${fundName ? ` - ${fundName}` : ''}`;
        notificationType = 'success';
        break;
      case 'error':
        title = '交易失敗';
        message = '交易處理時發生錯誤，請稍後重試';
        notificationType = 'error';
        break;
    }
    
    return addNotification({
      type: notificationType,
      title,
      message,
      autoHide: type !== 'error',
      action: txHash ? {
        label: '查看交易',
        onClick: () => window.open(`https://sepolia.etherscan.io/tx/${txHash}`, '_blank')
      } : undefined
    });
  }, [addNotification]);
}
