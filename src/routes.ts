/**
 * Every screen in the app, by path. The server reads this to serve pages;
 * the e2e specs and the help center read it to know what exists.
 */
export type Route = {
  path: string;
  page: "login" | "dashboard" | "settings" | "lab";
  title: string;
  /** Redirects to /login without a session. */
  signedIn: boolean;
};

export const routes: Route[] = [
  { path: "/lab", page: "lab", title: "Test lab", signedIn: false },
  { path: "/login", page: "login", title: "Log in", signedIn: false },
  { path: "/", page: "dashboard", title: "Dashboard", signedIn: true },
  { path: "/dashboard", page: "dashboard", title: "Dashboard", signedIn: true },
  { path: "/settings", page: "settings", title: "Settings", signedIn: true },
];
