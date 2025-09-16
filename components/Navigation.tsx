'use client';

import Link from 'next/link';
import ConnectButton from './ui/ConnectButton';
import { useAccount } from '../lib/web3-context';

export default function Navigation() {
  const { isConnected } = useAccount();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold text-primary-600">
              Fund Factory
            </Link>
            <div className="hidden md:ml-10 md:flex md:space-x-8">
              <Link href="/explore" className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium">
                探索基金
              </Link>
              {isConnected && (
                <Link href="/investor" className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium">
                  投資人儀表板
                </Link>
              )}
              {isConnected && (
                <Link href="/manager" className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium">
                  經理人儀表板
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <ConnectButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
