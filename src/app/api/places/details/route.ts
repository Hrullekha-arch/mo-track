
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const place_id = searchParams.get('place_id');
  const apiKey = process.env.GOOGLE_API_KEY;

  console.log('[API/DETAILS] Received request. place_id:', place_id);


  if (!apiKey) {
    console.error('[API/DETAILS] Google API key is not configured.');
    return NextResponse.json({ error: 'Google API key is not configured.' }, { status: 500 });
  }

  if (!place_id) {
    console.error('[API/DETAILS] Place ID is required.');
    return NextResponse.json({ error: 'Place ID is required.' }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${apiKey}&fields=address_components,formatted_address`;
  
  console.log('[API/DETAILS] Fetching URL:', url);

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log('[API/DETAILS] Google API Response:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API/DETAILS] Error fetching from Google Place Details API:', error);
    return NextResponse.json({ error: 'Failed to fetch place details.' }, { status: 500 });
  }
}

    