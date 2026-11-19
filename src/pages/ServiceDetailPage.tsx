import { Navigate } from "react-router-dom";

/**
 * Legacy /services/:serviceId articles are not verified purchasable services.
 * Redirect to the live capability directory rather than showing fictitious offers.
 */
const ServiceDetailPage = () => <Navigate to="/services-hub" replace />;

export default ServiceDetailPage;
