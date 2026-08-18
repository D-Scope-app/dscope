import {
  ageBucketCode,
  getAllAgeBuckets,
  getAllCountries,
  getAllRegions,
  worldRegionCode,
} from "../domain/predicate/predicate-codes";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

export async function handleMvpReferenceRoutes(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/mvp/reference")) {
    return null;
  }

  if (request.method !== "GET") {
    return errorResponse(
      405,
      "method_not_allowed",
      "Only GET is supported for MVP reference routes",
    );
  }

  const parts = getPathParts(url);

  // GET /mvp/reference/countries
  if (
    parts.length === 3 &&
    parts[0] === "mvp" &&
    parts[1] === "reference" &&
    parts[2] === "countries"
  ) {
    const countries = getAllCountries();

    return jsonResponse({
      ok: true,
      count: countries.length,
      countries,
    });
  }

  // GET /mvp/reference/regions
  if (
    parts.length === 3 &&
    parts[0] === "mvp" &&
    parts[1] === "reference" &&
    parts[2] === "regions"
  ) {
    const regions = getAllRegions().map((region) => ({
      id: region,
      code: worldRegionCode(region),
      label: region,
    }));

    return jsonResponse({
      ok: true,
      count: regions.length,
      regions,
    });
  }

  // GET /mvp/reference/age-buckets
  if (
    parts.length === 3 &&
    parts[0] === "mvp" &&
    parts[1] === "reference" &&
    parts[2] === "age-buckets"
  ) {
    const ageBuckets = getAllAgeBuckets().map((bucket) => ({
      id: bucket,
      code: ageBucketCode(bucket),
      label: bucket,
    }));

    return jsonResponse({
      ok: true,
      count: ageBuckets.length,
      ageBuckets,
    });
  }

  // GET /mvp/reference/predicate-codes
  if (
    parts.length === 3 &&
    parts[0] === "mvp" &&
    parts[1] === "reference" &&
    parts[2] === "predicate-codes"
  ) {
    const countries = getAllCountries();
    const regions = getAllRegions().map((region) => ({
      id: region,
      code: worldRegionCode(region),
      label: region,
    }));
    const ageBuckets = getAllAgeBuckets().map((bucket) => ({
      id: bucket,
      code: ageBucketCode(bucket),
      label: bucket,
    }));

    return jsonResponse({
      ok: true,
      version: 1,
      countries,
      regions,
      ageBuckets,
    });
  }

  return errorResponse(
    404,
    "mvp_reference_route_not_found",
    "MVP reference route not found",
  );
}
