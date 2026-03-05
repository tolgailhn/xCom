"""
Drafts API - Taslak tweet yonetimi
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class DraftCreate(BaseModel):
    text: str
    topic: str = ""
    style: str = ""


class DraftDelete(BaseModel):
    index: int


@router.get("/list")
async def list_drafts():
    """Tum taslaklari listele"""
    from backend.modules.style_manager import load_draft_tweets
    return {"drafts": load_draft_tweets()}


@router.post("/add")
async def add_draft(draft: DraftCreate):
    """Yeni taslak ekle"""
    from backend.modules.style_manager import add_draft as _add_draft
    _add_draft(text=draft.text, topic=draft.topic, style=draft.style)
    return {"success": True}


@router.post("/delete")
async def delete_draft(req: DraftDelete):
    """Taslak sil"""
    from backend.modules.style_manager import delete_draft as _delete_draft, load_draft_tweets
    drafts = load_draft_tweets()
    if req.index < 0 or req.index >= len(drafts):
        raise HTTPException(status_code=404, detail="Taslak bulunamadi")
    _delete_draft(req.index)
    return {"success": True}
