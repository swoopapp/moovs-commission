import moovsLogo from '../../assets/moovs-logo.png';

function moovsLogoSrc(): string {
  return typeof moovsLogo === 'string' ? moovsLogo : moovsLogo.src;
}

export function PoweredByMoovs() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-3 z-40">
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs text-gray-400">Powered by</span>
        <img src={moovsLogoSrc()} alt="Moovs" className="h-4 w-auto" />
      </div>
    </footer>
  );
}

export function MoovsLogo({ className = 'h-4 w-auto' }: { className?: string }) {
  return <img src={moovsLogoSrc()} alt="Moovs" className={className} />;
}
