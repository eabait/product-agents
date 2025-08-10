import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-2">
      <div className="bg-orange-500 rounded-full p-1.5">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex space-x-1">
        {[0, 0.2, 0.4].map((delay, i) => (
          <div
            key={i}
            className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
