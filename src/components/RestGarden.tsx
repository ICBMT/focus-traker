import { useState } from 'react';
import { Check, Flower2, Leaf, RotateCcw, Sun } from 'lucide-react';
import { Button, Modal } from './ui';

const shapes = [
  { name: 'Fern', icon: Leaf },
  { name: 'Flower', icon: Flower2 },
  { name: 'Sunshine', icon: Sun },
];
const deal = () => {
  const cards = [0, 0, 1, 1, 2, 2].map((shape, id) => ({ id, shape }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
};

export default function RestGarden({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState(deal);
  const [first, setFirst] = useState<number | null>(null);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const choose = (id: number) => {
    if (matched.includes(id) || first === id) return;
    if (first === null) {
      setOpen([id]);
      setFirst(id);
      return;
    }
    setOpen([first, id]);
    if (cards[first].shape === cards[id].shape) {
      setMatched((old) => [...old, first, id]);
      setOpen([]);
    }
    setFirst(null);
  };
  const restart = () => {
    setCards(deal());
    setFirst(null);
    setOpen([]);
    setMatched([]);
  };
  return (
    <Modal
      title="A tiny garden of attention."
      eyebrow="AN OPTIONAL LITTLE DIVERSION"
      onClose={onClose}
    >
      <p className="modal-description">
        Find three pairs at your own pace. No points, time limit, or conditions to meet. Prefer a
        screen-free pause? You can leave right now.
      </p>
      <div className="garden-grid" aria-label="Three-pair matching game">
        {cards.map((card, position) => {
          const revealed = open.includes(position) || matched.includes(position);
          const shape = shapes[card.shape];
          const Icon = shape.icon;
          return (
            <button
              type="button"
              key={card.id}
              className={`garden-tile ${revealed ? 'revealed' : ''} ${matched.includes(position) ? 'matched' : ''}`}
              aria-pressed={revealed}
              aria-label={
                revealed
                  ? `${shape.name}, card ${position + 1}${matched.includes(position) ? ', matched' : ''}`
                  : `Covered card ${position + 1}`
              }
              onClick={() => choose(position)}
            >
              {revealed ? (
                <Icon size={32} strokeWidth={1.4} />
              ) : (
                <Leaf size={22} strokeWidth={1.2} />
              )}
              {matched.includes(position) && <Check size={13} className="garden-check" />}
            </button>
          );
        })}
      </div>
      <div className="garden-message" role="status">
        {matched.length === 6
          ? 'A small moment, just for you. There is nothing else to earn.'
          : 'Your break is yours—even if you leave the garden unfinished.'}
      </div>
      <div className="modal-actions">
        <Button variant="ghost" onClick={restart}>
          <RotateCcw size={15} />A new pattern
        </Button>
        <Button onClick={onClose}>Leave the garden</Button>
      </div>
    </Modal>
  );
}
