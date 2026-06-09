import { AppRoutes } from "./routes/index.jsx";
import { InstallAppPrompt } from "@/components/pwa/install-app-prompt.jsx";

export default function App() {
  return (
    <>
      <AppRoutes />
      <InstallAppPrompt />
    </>
  );
}
