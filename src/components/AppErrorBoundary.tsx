import { Component, type ReactNode } from "react";
import { recordClientError } from "../lib/client-error-log";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.stack || error.message || "未知前端异常",
    };
  }

  componentDidCatch(error: Error) {
    console.error("[AppErrorBoundary]", error);
    recordClientError("error-boundary", error.stack || error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-shell">
          <div className="app-error-card">
            <strong>界面发生异常</strong>
            <span>请刷新页面后重试；错误信息已记录到本地。</span>
            <code className="app-error-card__detail">{this.state.message}</code>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
