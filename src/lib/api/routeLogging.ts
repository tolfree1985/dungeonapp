export function withRouteLogging<
  T extends (...args: any[]) => Promise<Response> | Response,
>(route: string, handler: T): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    const startedAt = Date.now();
    let status = 500;

    try {
      const response = await handler(...args);
      status = response.status;
      return response;
    } catch (error) {
      status = 500;
      throw error;
    } finally {
      console.info(
        JSON.stringify({
          event: "api_route",
          route,
          status,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  }) as T;
}
