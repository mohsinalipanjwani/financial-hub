export function NoAccess({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="text-lg font-semibold">Access restricted</h2>
      <p className="text-sm text-muted mt-1 max-w-sm">
        {message ??
          "You don't have permission to view this financial information. Contact an administrator if you believe this is a mistake."}
      </p>
    </div>
  );
}
