'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register once for the whole app (fixes "category is not a registered scale")
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Web3Provider } from '../lib/web3-context';
import { NotificationProvider, NotificationContainer } from '../components/ui/NotificationSystem';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <NotificationProvider>
          {children}
          <NotificationContainer />
        </NotificationProvider>
      </Web3Provider>
    </QueryClientProvider>
  );
}
