export interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
  area: string;
}

interface PhotonFeature {
  properties?: {
    countrycode?: string;
    name?: string;
    type?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
  };
  geometry?: { coordinates?: number[] };
}

export function photonResults(features: PhotonFeature[]): GeoResult[] {
  return features.flatMap(feature => {
    const properties = feature.properties;
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (properties?.countrycode?.toUpperCase() !== 'LT' || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const city = properties.city ?? (properties.type === 'city' ? properties.name : undefined) ?? properties.county ?? properties.state ?? '';
    const street = properties.street ?? (properties.housenumber || properties.name === city ? '' : properties.name) ?? '';
    const address = [street && `${street}${properties.housenumber ? ` ${properties.housenumber}` : ''}`,
      city, 'Lietuva'].filter(Boolean);
    const name = properties.name && properties.name !== street && properties.name !== city ? properties.name : '';
    return [{ display_name: [name, ...address].filter(Boolean).join(', '),
      lat: String(lat), lon: String(lon), area: [street, properties.district, city].filter(Boolean).join(', ') }];
  });
}
