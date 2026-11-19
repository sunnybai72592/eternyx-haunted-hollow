import { Link } from "react-router-dom";

const NotFound = () => (
  <section
    aria-labelledby="not-found-title"
    className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center gap-5 px-6 py-16 text-center"
  >
    <h1 id="not-found-title" className="text-3xl font-semibold text-foreground sm:text-4xl">
      Page not found
    </h1>
    <p className="text-muted-foreground">
      This link may be outdated. Return to the Eternyx homepage to find what you need.
    </p>
    <Link
      to="/"
      className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      Return to Eternyx home
    </Link>
  </section>
);

export default NotFound;
