interface TabDescriptor {
  label: string;
  shopName: string;
  busy: boolean;
  status: string;
}

interface Props {
  tabs: TabDescriptor[];
  active: number;
  onChange: (index: number) => void;
}

export default function MultiStoreTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="multi-store-tabs" role="tablist" aria-label="店铺切换">
      {tabs.map((tab, index) => {
        const isActive = active === index;
        return (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            data-busy={tab.busy}
            className="multi-store-tabs__item"
            onClick={() => onChange(index)}
          >
            <span className="multi-store-tabs__label">{tab.label}</span>
            {tab.shopName && (
              <span className="multi-store-tabs__shop">{tab.shopName}</span>
            )}
            {tab.status && (
              <span className="multi-store-tabs__status">{tab.status}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
