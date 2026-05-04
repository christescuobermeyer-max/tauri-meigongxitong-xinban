import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastType = "info" | "success" | "error";
interface ToastItem { id: number; message: string; type: ToastType }

interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 4000);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast-region">
        {items.map((it) => (
          <ToastEntry key={it.id} item={it} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastEntry({ item }: { item: ToastItem }) {
  useEffect(() => {}, []);
  return (
    <div className="toast" data-type={item.type}>
      <span className="toast__dot" />
      <span>{item.message}</span>
    </div>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}
