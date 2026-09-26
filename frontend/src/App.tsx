import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { AppRoutes } from "@/routes/AppRoutes";
import { DialogProvider } from "@/components/ui/DialogProvider";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DialogProvider>
          <AppRoutes />
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

