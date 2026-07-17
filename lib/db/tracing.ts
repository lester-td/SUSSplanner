import "server-only";

import {
  SpanStatusCode,
  trace,
  type Attributes,
} from "@opentelemetry/api";

const dbTracer = trace.getTracer("sussplanner.db");

export function traceDbOperation<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
)
{
  return dbTracer.startActiveSpan(
    name,
    {
      attributes: {
        "db.system": "postgresql",
        ...attributes,
      },
    },
    async (span) => {
      try
      {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      }
      catch (error)
      {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown database operation error",
        });
        throw error;
      }
      finally
      {
        span.end();
      }
    },
  );
}
