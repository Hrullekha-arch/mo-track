
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get('input');
  const components = searchParams.get('components');
  const types = searchParams.get('types'); // Allow passing 'types' parameter
  const apiKey = process.env.GOOGLE_API_KEY;

  console.log('[API/AUTOCOMPLETE] Received request. Input:', input, 'Components:', components, 'Types:', types);

  if (!apiKey) {
    console.error('[API/AUTOCOMPLETE] Google API key is not configured.');
    return NextResponse.json({ error: 'Google API key is not configured.' }, { status: 500 });
  }

  if (!input) {
    console.error('[API/AUTOCOMPLETE] Input query is required.');
    return NextResponse.json({ error: 'Input query is required.' }, { status: 400 });
  }

  // Corrected URL construction based on feedback
  let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${apiKey}`;

  // Use components only for country restriction
  if (components) {
    url += `&components=${encodeURIComponent(components)}`;
  } else {
    // Default to India if no specific components are provided
    url += `&components=country:in`;
  }
  
  // Add types parameter if it exists (e.g., 'geocode')
  if (types) {
      url += `&types=${encodeURIComponent(types)}`;
  }


  console.log('[API/AUTOCOMPLETE] Fetching Corrected URL:', url);

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log('[API/AUTOCOMPLETE] Google API Response:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API/AUTOCOMPLETE] Error fetching from Google Places API:', error);
    return NextResponse.json({ error: 'Failed to fetch address suggestions.' }, { status: 500 });
  }
}
