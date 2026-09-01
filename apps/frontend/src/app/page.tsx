'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { HealthData } from '@/types';

interface HealthStatus {
  loading: boolean;
  connected: boolean;
  data: HealthData | null;
  error: string | null;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus>({
    loading: true,
    connected: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await api.get<HealthData>('/health');
        
        // If we got a response, the backend is reachable
        if (response.success && response.data) {
          setHealth({
            loading: false,
            connected: true,
            data: response.data,
            error: null,
          });
        } else {
          // Backend responded but DB is down
          setHealth({
            loading: false,
            connected: true,
            data: {
              api: 'ok',
              database: 'disconnected',
              timestamp: new Date().toISOString(),
              environment: 'development',
            },
            error: response.message || 'Database is not available',
          });
        }
      } catch {
        setHealth({
          loading: false,
          connected: false,
          data: null,
          error: 'Cannot reach backend server',
        });
      }
    };

    checkHealth();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-800/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-700/10 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-12 px-6">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-zinc-400 mb-4">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            Week 1 Foundation
          </div>

          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight">
            <span className="gradient-text">Abhinay</span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-lg mx-auto leading-relaxed">
            Film Production Networking &amp; Casting Platform
          </p>
        </div>

        {/* Status Card */}
        <div className="glass rounded-2xl p-8 w-full max-w-md space-y-6 shadow-2xl shadow-brand-900/20">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            System Status
          </h2>

          {health.loading ? (
            <div className="space-y-4">
              <StatusRow label="Backend" status="loading" />
              <StatusRow label="Database" status="loading" />
            </div>
          ) : health.connected && health.data ? (
            <div className="space-y-4">
              <StatusRow
                label="Backend"
                status={health.data.api === 'ok' ? 'connected' : 'error'}
              />
              <StatusRow
                label="Database"
                status={health.data.database === 'connected' ? 'connected' : 'error'}
              />
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-600">
                  Environment: {health.data.environment} &middot;{' '}
                  {new Date(health.data.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <StatusRow label="Backend" status="error" />
              <StatusRow label="Database" status="error" />
              {health.error && (
                <p className="text-sm text-red-400/80 pt-2">{health.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Tech Stack */}
        <div className="flex flex-wrap justify-center gap-3 max-w-lg">
          {[
            'Next.js',
            'Express',
            'TypeScript',
            'PostgreSQL',
            'Prisma',
            'JWT',
            'Tailwind CSS',
          ].map((tech) => (
            <span
              key={tech}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-brand-600/50 hover:text-brand-300 transition-colors duration-200"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

// ── Status Row Component ──────────────────────────────

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: 'connected' | 'error' | 'loading';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        {status === 'loading' ? (
          <>
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-amber-400">Checking...</span>
          </>
        ) : status === 'connected' ? (
          <>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span className="text-sm text-emerald-400">Connected</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm text-red-400">Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
