import { useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isProcessing: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  isProcessing,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-border bg-background">
      <div className="max-w-3xl mx-auto px-6 py-4">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            disabled={isProcessing}
            rows={1}
            className="min-h-[60px] max-h-[200px] pr-14 text-base border-2 border-border rounded-2xl resize-none focus:border-ring"
          />

          <Button
            onClick={onSend}
            disabled={!value.trim() || isProcessing}
            size="icon"
            aria-disabled={!value.trim() || isProcessing}
            className={`absolute bottom-2 right-2 h-9 w-9 rounded-xl transition-colors ${
              value.trim() && !isProcessing
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          AI responses may be inaccurate. Verify important info.
        </p>
      </div>
    </div>
  );
}
