import { Navigate } from "react-router-dom";

/**
 * Retain /services as a legacy alias for the verified ETERNYX capability directory.
 * Older service marketing advertised unavailable consulting offerings as operational.
 */
const ServicesPage = () => <Navigate to="/services-hub" replace />;

export default ServicesPage;
