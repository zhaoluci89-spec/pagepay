"""Admin ad analytics endpoints.

Provides per-user daily ad stats, daily ad totals, and per-ad-unit
breakdowns. All endpoints require admin auth.
"""

import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AdEvent, User
from app.schemas import UserDailyAdStat, AdDailyTotals, AdUnitDailyStat
from app.services.admin_auth import require_permission

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/ads", tags=["admin-ads"])


@router.get("/daily-user-stats", response_model=list[UserDailyAdStat])
async def daily_user_ad_stats(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    current_admin = Depends(require_permission("dashboard.view")),
    db: AsyncSession = Depends(get_db),
):
    """Get per-user daily ad watch stats.

    Returns one row per (user, date) with:
    - number of ads watched
    - total points earned
    """
    end = datetime.utcnow()
    start = end - timedelta(days=30)

    if start_date:
        start = datetime.fromisoformat(start_date)
    if end_date:
        end = datetime.fromisoformat(end_date)

    # Query: group by user_id + date(created_at)
    stmt = (
        select(
            AdEvent.user_id,
            func.date(AdEvent.created_at).label("event_date"),
            func.count(AdEvent.id).label("ads_watched"),
            func.sum(AdEvent.user_points_credited).label("points_earned"),
        )
        .where(AdEvent.created_at >= start)
        .where(AdEvent.created_at <= end)
        .where(AdEvent.credit_status == "credited")
        .group_by(AdEvent.user_id, func.date(AdEvent.created_at))
        .order_by(func.date(AdEvent.created_at).desc(), AdEvent.user_id)
    )

    results = await db.execute(stmt)
    rows = results.all()

    return [
        UserDailyAdStat(
            user_id=row.user_id,
            date=str(row.event_date),
            ads_watched=row.ads_watched or 0,
            points_earned=row.points_earned or 0,
        )
        for row in rows
    ]


@router.get("/daily-totals", response_model=list[AdDailyTotals])
async def daily_ad_totals(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    current_admin = Depends(require_permission("dashboard.view")),
    db: AsyncSession = Depends(get_db),
):
    """Get daily ad totals across all users.

    Returns one row per day with:
    - total ads watched
    - total points credited
    - unique users who watched ads
    - revenue estimates
    """
    end = datetime.utcnow()
    start = end - timedelta(days=30)

    if start_date:
        start = datetime.fromisoformat(start_date)
    if end_date:
        end = datetime.fromisoformat(end_date)

    # Base query for all credited events in range
    base_stmt = (
        select(AdEvent)
        .where(AdEvent.created_at >= start)
        .where(AdEvent.created_at <= end)
        .where(AdEvent.credit_status == "credited")
    )

    # Daily aggregation
    daily_stmt = (
        select(
            func.date(AdEvent.created_at).label("event_date"),
            func.count(AdEvent.id).label("total_ads"),
            func.sum(AdEvent.user_points_credited).label("total_points"),
            func.count(func.distinct(AdEvent.user_id)).label("total_users"),
        )
        .where(AdEvent.created_at >= start)
        .where(AdEvent.created_at <= end)
        .where(AdEvent.credit_status == "credited")
        .group_by(func.date(AdEvent.created_at))
        .order_by(func.date(AdEvent.created_at).desc())
    )

    daily_results = await db.execute(daily_stmt)
    daily_rows = daily_results.all()

    # Get revenue for each day
    revenue_by_day: dict[str, float] = {}
    kobo_by_day: dict[str, int] = {}

    events = await db.execute(base_stmt)
    for event in events.scalars().all():
        day = event.created_at.date().isoformat()
        if event.revenue_usd and event.fx_rate_used:
            usd = float(event.revenue_usd) / 1_000_000
            fx = float(event.fx_rate_used) / 1_000_000
            revenue_by_day[day] = revenue_by_day.get(day, 0.0) + usd
            kobo_by_day[day] = kobo_by_day.get(day, 0) + int(usd * fx * 100)

    return [
        AdDailyTotals(
            date=str(row.event_date),
            total_ads=row.total_ads or 0,
            total_points_credited=row.total_points or 0,
            total_users=row.total_users or 0,
            total_revenue_usd=revenue_by_day.get(str(row.event_date), 0.0),
            total_revenue_ngn_kobo=kobo_by_day.get(str(row.event_date), 0),
        )
        for row in daily_rows
    ]


@router.get("/unit-daily-stats", response_model=list[AdUnitDailyStat])
async def unit_daily_stats(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    current_admin = Depends(require_permission("dashboard.view")),
    db: AsyncSession = Depends(get_db),
):
    """Get per-ad-unit daily stats.

    Returns one row per (ad_unit, date) with:
    - number of ads served
    - total points credited
    """
    end = datetime.utcnow()
    start = end - timedelta(days=30)

    if start_date:
        start = datetime.fromisoformat(start_date)
    if end_date:
        end = datetime.fromisoformat(end_date)

    stmt = (
        select(
            AdEvent.ad_unit,
            func.date(AdEvent.created_at).label("event_date"),
            func.count(AdEvent.id).label("ads_count"),
            func.sum(AdEvent.user_points_credited).label("points_credited"),
        )
        .where(AdEvent.created_at >= start)
        .where(AdEvent.created_at <= end)
        .where(AdEvent.credit_status == "credited")
        .group_by(AdEvent.ad_unit, func.date(AdEvent.created_at))
        .order_by(func.date(AdEvent.created_at).desc(), AdEvent.ad_unit)
    )

    results = await db.execute(stmt)
    rows = results.all()

    return [
        AdUnitDailyStat(
            date=str(row.event_date),
            ad_unit=row.ad_unit,
            ads_count=row.ads_count or 0,
            points_credited=row.points_credited or 0,
        )
        for row in rows
    ]
