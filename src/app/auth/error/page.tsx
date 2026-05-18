export default function AuthErrorPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Unable to sign in</h1>
        <p className="mt-2 text-sm text-gray-500">
          Use a Google account from @moovsapp.com or @swoopapp.com.
        </p>
        <a href="/auth/sign-in" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline">
          Try again
        </a>
      </div>
    </main>
  );
}
