// app/api/funds/investments/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/mock-database';

export const dynamic = 'force-dynamic'; // <- opt out of SSG for this route
export const revalidate = 0;            // <- no caching

// GET /api/funds/investments/summary?fundId=...&investor=...
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams; // (OK to keep, route is now dynamic)
    const fundId = searchParams.get('fundId');
    const investor = searchParams.get('investor');

    if (!fundId || !investor) {
      return NextResponse.json(
        { success: false, error: '需要提供 fundId 和 investor 參數' },
        { status: 400 }
      );
    }

    const database = getDatabase();
    const summary = database.getUserInvestmentSummary(fundId, investor);

    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
