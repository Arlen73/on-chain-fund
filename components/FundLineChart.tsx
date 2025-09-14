'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chart.js/auto'; // Using auto registration

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface FundLineChartProps {
  chartData: { timestamp: number; sharePrice: number }[];
  title: string;
}

const FundLineChart = ({ chartData, title }: FundLineChartProps) => {
  const data = {
    labels: chartData.map(d => new Date(d.timestamp * 1000).toLocaleDateString()),
    datasets: [
      {
        label: 'Share Price',
        data: chartData.map(d => d.sharePrice),
        borderColor: '#4F46E5',
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        fill: true,
        tension: 0.4,
        pointRadius: 0, // Hide points
        pointHoverRadius: 5, // Show on hover
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // We can hide the legend if there's only one dataset
      },
      title: {
        display: true,
        text: title,
        font: {
          size: 18,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        grid: {
          color: '#E5E7EB',
        },
        ticks: {
          callback: function (value: any) {
            return '$' + value.toFixed(2);
          },
        },
      },
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  };

  return (
    <div className="card h-96">
      <Line options={options} data={data} />
    </div>
  );
};

export default FundLineChart;
