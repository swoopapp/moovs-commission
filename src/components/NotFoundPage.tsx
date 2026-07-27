import moovsLogo from '../assets/moovs-logo.png';
import { PoweredByMoovs } from './layout/PoweredByMoovs';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 pb-16">
      <div className="text-center space-y-6 max-w-md">
        <img
          src={typeof moovsLogo === 'string' ? moovsLogo : moovsLogo.src}
          alt="Moovs"
          className="h-12 w-auto mx-auto"
        />
        <h1 className="text-2xl font-semibold text-gray-900">
          Commission Tracking
        </h1>
        <p className="text-gray-500">
          This commission portal could not be found. Open the secure portal link provided by Moovs.
        </p>
      </div>
      <PoweredByMoovs />
    </div>
  );
}
