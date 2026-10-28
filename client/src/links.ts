/** El perfil de GitHub de Marco, quien hace el juego. */
export const GITHUB_PROFILE_URL = "https://github.com/marcovinir";

/** El repositorio público donde se reciben ideas y avisos de errores (el del juego es privado). */
export const FEEDBACK_REPO_URL = "https://github.com/marcovinir/pokeminigames-comentarios";

/** Abrir una issue con una de las plantillas del repositorio de comentarios. */
export function newIssueUrl(template: "idea" | "error"): string {
  return `${FEEDBACK_REPO_URL}/issues/new?template=${template}.yml`;
}
