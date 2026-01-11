import * as common from 'oci-common';

export function getProvider() {
    // Priority: 1. Env Vars (for containers/cloud), 2. Config File (local dev)

    // Try User Principal (Config File)
    try {
        const provider = new common.ConfigFileAuthenticationDetailsProvider();
        console.log('Using OCI Config File Provider');
        return provider;
    } catch (e) {
        console.log('OCI Config File not found, trying Instance Principal / Resource Principal...');
    }

    // Try Resource Principal (if running on OCI Compute/Functions)
    // return new common.ResourcePrincipalAuthenticationDetailsProvider();

    throw new Error('No OCI authentication provider found. Please configure ~/.oci/config or environment variables.');
}
