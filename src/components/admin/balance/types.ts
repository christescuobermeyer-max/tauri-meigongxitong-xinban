export interface BalanceCardHandle {
  /** 由父组件触发的强制刷新（用于「一键刷新」） */
  refresh: () => Promise<void>;
}

type CardStatus = "idle" | "loading" | "ok" | "expired" | "no_session" | "error" | "logging_in";

export interface CardState {
  status: CardStatus;
  /** 上次成功的数据 */
  data?: { balance: number; historyUsed: number; unit: string; displayName?: string };
  /** 最近一次拉取时间（前端记录的） */
  lastFetchedAt?: number;
  /** 错误描述（前端显示） */
  errorMessage?: string;
  /** 是否打开了后台 console 浏览器（独立于 status，因为不影响余额数据） */
  consoleOpen?: boolean;
}
