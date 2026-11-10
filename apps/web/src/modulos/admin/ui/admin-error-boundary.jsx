import { Component } from "react";
import { reportAdminPanelIssue } from "@/lib/observability.js";

/**
 * Evita que un crash en una sección deje todo el panel admin en blanco.
 */
export class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    void reportAdminPanelIssue({
      reason: "render_error",
      userId: this.props.userId || null,
      permissions: this.props.permissions || [],
      pathname: this.props.pathname || null,
      error,
      message: error?.message || "Admin panel render error",
      componentStack: info?.componentStack || null,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="admin-embedded-loading admin-panel-error" role="alert">
          <p className="card-heading" style={{ marginBottom: 8 }}>
            {this.props.title || "No se pudo mostrar esta sección"}
          </p>
          <p className="card-sub" style={{ marginBottom: 12 }}>
            {this.props.subtitle
              || "Ocurrió un error al cargar el contenido. Prueba otra pestaña o recarga la página."}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
