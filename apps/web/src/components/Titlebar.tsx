import { Icon } from "./Icon";

export function Titlebar() {
  return (
    <div className="titlebar" role="banner">
      <div className="titlebar-left">
        <div className="titlebar-icon" aria-hidden="true">
          <Icon name="owl" size={11} />
        </div>
        <span className="titlebar-title">ZecVault</span>
      </div>
      <div className="titlebar-right">
        <button className="titlebar-btn" aria-label="Minimize"><Icon name="minus" size={14} /></button>
        <button className="titlebar-btn" aria-label="Maximize"><Icon name="square" size={12} /></button>
        <button className="titlebar-btn close" aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
    </div>
  );
}
