'use client';

import Link from 'next/link';

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  href?: string;
  highlight?: boolean;
}

export default function SummaryCard({ title, value, subtitle, href, highlight }: SummaryCardProps) {
  const card = (
    <div className="bg-white rounded-xl shadow px-5 py-4 hover:shadow-md transition-shadow">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}
