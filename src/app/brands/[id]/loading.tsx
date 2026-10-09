export default function Loading() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-12" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 animate-pulse bg-hairline" />
      <div className="mt-4 h-12 w-72 max-w-full animate-pulse bg-hairline" />
      <div className="mt-8 space-y-3"><div className="h-4 w-full max-w-xl animate-pulse bg-hairline" /><div className="h-4 w-2/3 max-w-md animate-pulse bg-hairline" /></div>
    </div>
  );
}
