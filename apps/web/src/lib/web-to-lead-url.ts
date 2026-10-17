export function composeWebToLeadEndpointUrl(apiBaseUrl: string, endpointPath: string): string {
  const apiUrl = new URL(apiBaseUrl);
  const normalizedEndpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  return new URL(normalizedEndpointPath, apiUrl.origin).toString();
}
