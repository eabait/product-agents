export function WelcomeScreen({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <h1 className="text-3xl font-normal text-foreground mb-8 text-center">
        How can I help you today?
      </h1>

      {suggestions.length > 0 && (
        <div className="w-full max-w-4xl grid gap-3 md:grid-cols-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className="p-4 rounded-xl border border-border hover:border-muted-foreground/30 hover:bg-muted/30 transition-all"
            >
              <div className="text-sm text-foreground">{s}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
