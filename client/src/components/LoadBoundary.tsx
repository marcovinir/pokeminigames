import { Component, type ReactNode } from "react";
import { LOAD_ERROR_TEXT } from "../i18n/es";
import { Button } from "./Button";
import { Notice } from "./Notice";

interface LoadBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
  /** Al cambiar (la dirección), el error ya no vale: la otra página se intenta cargar. */
  resetKey?: string;
}

/**
 * Para las páginas que se cargan aparte (`lazy`): tras un despliegue, una pestaña vieja pide un archivo que ya no existe, y
 * sin red también falla. Sin este límite, React desmonta toda la aplicación y queda la página en blanco.
 */
export class LoadBoundary extends Component<LoadBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(previous: LoadBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const { onReload = () => window.location.reload() } = this.props;
    return (
      <section className="mx-auto max-w-md text-center">
        <Notice tone="danger">{LOAD_ERROR_TEXT.message}</Notice>
        <div className="mt-4">
          <Button variant="primary" onClick={onReload}>
            {LOAD_ERROR_TEXT.reload}
          </Button>
        </div>
      </section>
    );
  }
}
