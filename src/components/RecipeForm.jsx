import { useState, useRef, useEffect } from 'react'
import { fileToThumbnail } from '../utils/media'
import { generateRecipeImage } from '../utils/aiImage'
import styles from './RecipeForm.module.css'

// Editor for a single text list (ingredients / steps), with add & remove rows.
// Enter adds a new row right below and focuses it (Shift+Enter = newline).
function ListEditor({ items, setItems, placeholder, multiline }) {
  const inputRefs = useRef([])
  const [focusIndex, setFocusIndex] = useState(null)

  useEffect(() => {
    if (focusIndex != null) {
      inputRefs.current[focusIndex]?.focus()
      setFocusIndex(null)
    }
  }, [focusIndex, items])

  const update = (i, val) => setItems(items.map((it, idx) => (idx === i ? val : it)))
  const remove = i => setItems(items.filter((_, idx) => idx !== i))
  const add = () => { setItems([...items, '']); setFocusIndex(items.length) }
  const addAfter = i => {
    setItems([...items.slice(0, i + 1), '', ...items.slice(i + 1)])
    setFocusIndex(i + 1)
  }

  const handleKeyDown = (e, i) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addAfter(i)
    }
  }

  return (
    <div className={styles.listEditor}>
      {items.map((item, i) => (
        <div key={i} className={styles.listRow}>
          <span className={styles.rowNum}>{i + 1}</span>
          {multiline ? (
            <textarea
              ref={el => (inputRefs.current[i] = el)}
              className={styles.rowInput}
              rows={2}
              value={item}
              placeholder={`${placeholder} ${i + 1}`}
              onChange={e => update(i, e.target.value)}
              onKeyDown={e => handleKeyDown(e, i)}
            />
          ) : (
            <input
              ref={el => (inputRefs.current[i] = el)}
              className={styles.rowInput}
              value={item}
              placeholder={`${placeholder} ${i + 1}`}
              onChange={e => update(i, e.target.value)}
              onKeyDown={e => handleKeyDown(e, i)}
            />
          )}
          <button type="button" className={styles.rowRemove} onClick={() => remove(i)} aria-label="삭제">✕</button>
        </div>
      ))}
      <button type="button" className={styles.addRow} onClick={add}>+ 추가</button>
      <p className={styles.editorHint}>
        엔터로 다음 칸 추가{multiline ? ' (줄바꿈은 Shift+Enter)' : ''}
      </p>
    </div>
  )
}

export default function RecipeForm({ recipe, onSave, onClose, apiKey }) {
  const isEdit = !!recipe
  const [title, setTitle] = useState(recipe?.title || '')
  const [thumbnail, setThumbnail] = useState(recipe?.thumbnail || '')
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length ? recipe.ingredients : ['']
  )
  const [steps, setSteps] = useState(recipe?.steps?.length ? recipe.steps : [''])
  const [note, setNote] = useState(recipe?.note || '')
  const [mediaStatus, setMediaStatus] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setMediaStatus('미디어를 처리하는 중...')
    setError('')
    try {
      const thumb = await fileToThumbnail(file)
      setThumbnail(thumb)
      setMediaStatus('')
    } catch (err) {
      setMediaStatus('')
      setError(err.message || '미디어를 불러올 수 없어요')
    }
  }

  async function handleGenerateImage() {
    const cleanIngredients = ingredients.map(s => s.trim()).filter(Boolean)
    if (!title.trim() && cleanIngredients.length === 0) {
      setError('레시피 이름이나 재료를 먼저 입력해 주세요')
      return
    }
    setError('')
    setAiLoading(true)
    setMediaStatus('AI가 어울리는 그림을 그리는 중... 🎨')
    try {
      const dataUrl = await generateRecipeImage({
        title: title.trim(),
        ingredients: cleanIngredients,
        steps: steps.map(s => s.trim()).filter(Boolean),
        apiKey,
      })
      setThumbnail(dataUrl)
      setMediaStatus('')
    } catch (err) {
      setMediaStatus('')
      setError(err.message || 'AI 이미지를 만들지 못했어요')
    } finally {
      setAiLoading(false)
    }
  }

  function handleSave() {
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('레시피 이름을 입력해 주세요')
      return
    }
    const cleanIngredients = ingredients.map(s => s.trim()).filter(Boolean)
    const cleanSteps = steps.map(s => s.trim()).filter(Boolean)

    const base = recipe || {}
    const existingTags = base.tags || []
    const tags = !isEdit && !existingTags.includes('셀프')
      ? ['셀프', ...existingTags]
      : existingTags

    onSave({
      ...base,
      id: base.id || `self-${Date.now()}`,
      title: cleanTitle,
      author: base.author ?? '나의 레시피',
      thumbnail: thumbnail || base.thumbnail || '',
      videoUrl: base.videoUrl || '',
      ingredients: cleanIngredients,
      sauce: base.sauce || [],
      steps: cleanSteps,
      note: note.trim(),
      tags,
      favorite: base.favorite || false,
      createdAt: base.createdAt || Date.now(),
      isSelf: base.isSelf ?? !isEdit,
    })
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={onClose} aria-label="뒤로">←</button>
        <span className={styles.topTitle}>{isEdit ? '레시피 수정' : '레시피 만들기'}</span>
        <button className={styles.saveTop} onClick={handleSave}>저장</button>
      </header>

      <div className={styles.scroll}>
        {/* Media upload + thumbnail preview */}
        <div className={styles.mediaSection}>
          <label className={styles.mediaUpload}>
            {thumbnail ? (
              <img className={styles.mediaPreview} src={thumbnail} alt="썸네일 미리보기" />
            ) : (
              <div className={styles.mediaPlaceholder}>
                <span className={styles.mediaIcon}>🖼️</span>
                <span className={styles.mediaText}>이미지 / 영상 업로드</span>
                <span className={styles.mediaHint}>탭해서 썸네일로 사용할 파일을 골라주세요</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              className={styles.fileInput}
              onChange={handleFile}
            />
          </label>
          <button
            type="button"
            className={styles.aiBtn}
            onClick={handleGenerateImage}
            disabled={aiLoading}
          >
            {aiLoading ? '🎨 AI가 그림 그리는 중...' : '✨ AI 추천 이미지 만들기'}
          </button>
          <p className={styles.aiHint}>레시피 내용을 보고 귀여운 파스텔 그림을 그려줘요</p>

          {thumbnail && (
            <div className={styles.mediaActions}>
              <label className={styles.changeBtn}>
                사진/영상 변경
                <input type="file" accept="image/*,video/*" className={styles.fileInput} onChange={handleFile} />
              </label>
              <button type="button" className={styles.removeBtn} onClick={() => setThumbnail('')}>제거</button>
            </div>
          )}
          {mediaStatus && <p className={styles.mediaStatus}>{mediaStatus}</p>}
        </div>

        {/* Title */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>레시피 이름</h2>
          <input
            className={styles.titleInput}
            value={title}
            placeholder="예) 엄마표 비름나물 무침"
            onChange={e => setTitle(e.target.value)}
          />
        </section>

        {/* Ingredients */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🥕 재료</h2>
          <ListEditor items={ingredients} setItems={setIngredients} placeholder="재료" />
        </section>

        {/* Steps */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>👩‍🍳 조리법</h2>
          <ListEditor items={steps} setItems={setSteps} placeholder="단계" multiline />
        </section>

        {/* Note */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>💬 메모</h2>
          <textarea
            className={styles.noteInput}
            rows={4}
            value={note}
            placeholder="팁, 주의사항, 보관법 등을 자유롭게 적어주세요"
            onChange={e => setNote(e.target.value)}
          />
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.saveBottom} onClick={handleSave}>
          {isEdit ? '수정 완료' : '레시피 저장'}
        </button>

        <div className={styles.bottomSpace} />
      </div>
    </div>
  )
}
