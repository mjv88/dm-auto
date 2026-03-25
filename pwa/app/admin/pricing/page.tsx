'use client';

export default function PricingPage() {
  return (
    <div className="w-full h-[calc(100vh-120px)]">
      <iframe
        src="/pricing-dashboard.html"
        className="w-full h-full border-0"
        title="DM Pricing Overview"
      />
    </div>
  );
}
