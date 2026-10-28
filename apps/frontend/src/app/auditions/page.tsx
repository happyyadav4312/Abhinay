'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/common/RequireAuth';
import { SiteHeader } from '@/components/common/SiteHeader';
import { AuditionCard } from '@/components/auditions/AuditionCard';
import { auditionApi } from '@/lib/api';
import { Audition, AuditionStatus } from '@/types';
import { Spinner } from '@/components/ui/spinner';
import { Video } from 'lucide-react';

const FILTER_TABS: { label: string; value: AuditionStatus | 'ALL' }[] = [
  { label: 'All Auditions', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Under Review', value: 'UNDER_REVIEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

export default function AuditionsPage() {
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [activeTab, setActiveTab] = useState<AuditionStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const queryParams = activeTab === 'ALL' ? {} : { status: activeTab };

    auditionApi
      .listMine(queryParams)
      .then((res) => {
        if (active) setAuditions(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-100">
              My Auditions
            </h1>
            <p className="text-sm text-stone-400 mt-1">
              Self-tape requests and submission feedback from casting calls.
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-stone-800">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  setLoading(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.value
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List or States */}
          {loading ? (
            <div className="p-16 flex justify-center">
              <Spinner className="h-8 w-8 text-amber-500" />
            </div>
          ) : auditions.length === 0 ? (
            <div className="p-16 rounded-2xl border border-stone-800 bg-stone-900/40 text-center flex flex-col items-center justify-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-500">
                <Video className="h-7 w-7 stroke-1" />
              </div>
              <h3 className="text-base font-semibold text-stone-200">
                No audition requests found
              </h3>
              <p className="text-xs text-stone-400 max-w-sm">
                When casting directors shortlist your application and request a
                self-tape, it will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditions.map((audition) => (
                <AuditionCard key={audition.id} audition={audition} />
              ))}
            </div>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}
