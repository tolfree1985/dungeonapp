type RouteHandler<TArgs extends unknown[]> = (...args: TArgs) => Promise<Response> | Response;

export function withRouteLogging<TArgs extends unknown[]>(route: string, handler: RouteHandler<TArgs>) {
  return async (...args: TArgs): Promise<Response> => {
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
  };
}
