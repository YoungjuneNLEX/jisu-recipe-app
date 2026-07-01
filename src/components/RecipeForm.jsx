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

export default function RecipeForm({
  recipe, onSave, onClose, apiKey,
  categories = [], onAddCategory, onRenameCategory, onDeleteCategory,
}) {
  const isEdit = !!recipe
  const [title, setTitle] = useState(recipe?.title || '')
  const [category, setCategory] = useState(recipe?.category || '')
  const [addingCat, setAddingCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [manageCat, setManageCat] = useState(false)
  const [renamingCat, setRenamingCat] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [thumbnail, setThumbnail] = useState(recipe?.thumbnail || '')
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length ? recipe.ingredients : ['']
  )
  const [sauce, setSauce] = useState(recipe?.sauce?.length ? recipe.sauce : [])
  const [steps, setSteps] = useState(recipe?.steps?.length ? recipe.steps : [''])
  const [note, setNote] = useState(recipe?.note || '')
  const [mediaStatus, setMediaStatus] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiError, setAiError] = useState('')
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

  function openAiModal() {
    setAiError('')
    setShowAiModal(true)
  }

  async function handleGenerateImage() {
    const cleanIngredients = ingredients.map(s => s.trim()).filter(Boolean)
    if (!title.trim() && cleanIngredients.length === 0) {
      setAiError('레시피 이름이나 재료를 먼저 입력해 주세요')
      return
    }
    setAiError('')
    setAiLoading(true)
    try {
      const dataUrl = await generateRecipeImage({
        title: title.trim(),
        ingredients: cleanIngredients,
        steps: steps.map(s => s.trim()).filter(Boolean),
        instruction: aiInstruction,
        apiKey,
      })
      setThumbnail(dataUrl)
      setShowAiModal(false)
    } catch (err) {
      setAiError(err.message || 'AI 이미지를 만들지 못했어요')
    } finally {
      setAiLoading(false)
    }
  }

  function handleCreateCategory(e) {
    e.preventDefault()
    const name = newCat.trim()
    if (name) {
      onAddCategory?.(name)
      setCategory(name)
    }
    setNewCat('')
    setAddingCat(false)
  }

  // Commit on Enter AND on blur — committing on blur fixes mobile keyboards,
  // where the input loses focus before the form's submit can fire.
  function commitRenameCategory() {
    if (renamingCat == null) return
    const next = renameDraft.trim()
    if (next && next !== renamingCat) {
      onRenameCategory?.(renamingCat, next)
      if (category === renamingCat) setCategory(next)
    }
    setRenamingCat(null)
    setRenameDraft('')
  }

  function handleDeleteCat(name) {
    onDeleteCategory?.(name)
    if (category === name) setCategory('')
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
      category,
      ingredients: cleanIngredients,
      sauce: sauce.map(s => s.trim()).filter(Boolean),
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
          <button type="button" className={styles.aiBtn} onClick={openAiModal}>
            {thumbnail ? '✨ 동동이 이미지 수정 / 재생성' : '✨ 동동이가 이미지 만들기'}
          </button>
          <p className={styles.aiHint}>동동이가 레시피 내용을 보고 귀여운 파스텔 그림을 그려줘요</p>

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

        {/* Category */}
        <section className={styles.section}>
          <div className={styles.sectionHeadRow}>
            <h2 className={styles.sectionTitle}>📁 카테고리</h2>
            {categories.length > 0 && (
              <button
                type="button"
                className={styles.manageBtn}
                onClick={() => { setManageCat(m => !m); setRenamingCat(null) }}
              >{manageCat ? '완료' : '편집'}</button>
            )}
          </div>

          {manageCat ? (
            <div className={styles.catManage}>
              {categories.map(c => (
                renamingCat === c ? (
                  <form key={c} onSubmit={e => { e.preventDefault(); commitRenameCategory() }} className={styles.catManageRow}>
                    <input
                      autoFocus
                      className={styles.catInput}
                      value={renameDraft}
                      onChange={e => setRenameDraft(e.target.value)}
                      onBlur={commitRenameCategory}
                    />
                  </form>
                ) : (
                  <div key={c} className={styles.catManageRow}>
                    <span className={styles.catManageName}>{c}</span>
                    <button
                      type="button"
                      className={styles.catManageEdit}
                      onClick={() => { setRenamingCat(c); setRenameDraft(c) }}
                    >✎ 이름변경</button>
                    <button
                      type="button"
                      className={styles.catManageDelete}
                      onClick={() => handleDeleteCat(c)}
                    >🗑 삭제</button>
                  </div>
                )
              ))}
              {addingCat ? (
                <form onSubmit={handleCreateCategory} className={styles.catManageRow}>
                  <input
                    autoFocus
                    className={styles.catInput}
                    value={newCat}
                    placeholder="새 카테고리"
                    onChange={e => setNewCat(e.target.value)}
                    onBlur={() => { setNewCat(''); setAddingCat(false) }}
                  />
                </form>
              ) : (
                <button type="button" className={styles.catAdd} onClick={() => setAddingCat(true)}>+ 새 카테고리</button>
              )}
            </div>
          ) : (
            <div className={styles.catPicker}>
              <button
                type="button"
                className={`${styles.catChip} ${!category ? styles.catChipActive : ''}`}
                onClick={() => setCategory('')}
              >미분류</button>
              {categories.map(c => (
                <button
                  type="button"
                  key={c}
                  className={`${styles.catChip} ${category === c ? styles.catChipActive : ''}`}
                  onClick={() => setCategory(c)}
                >{c}</button>
              ))}
              {addingCat ? (
                <form onSubmit={handleCreateCategory} style={{ display: 'inline' }}>
                  <input
                    autoFocus
                    className={styles.catInput}
                    value={newCat}
                    placeholder="새 카테고리"
                    onChange={e => setNewCat(e.target.value)}
                    onBlur={() => { setNewCat(''); setAddingCat(false) }}
                  />
                </form>
              ) : (
                <button type="button" className={styles.catAdd} onClick={() => setAddingCat(true)}>+ 새 카테고리</button>
              )}
            </div>
          )}
        </section>

        {/* Ingredients */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🥕 재료</h2>
          <p className={styles.subSectionLabel}>주재료</p>
          <ListEditor items={ingredients} setItems={setIngredients} placeholder="재료" />
          <p className={styles.subSectionLabel}>양념장</p>
          <ListEditor items={sauce.length ? sauce : ['']} setItems={setSauce} placeholder="양념" />
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

      {showAiModal && (
        <div className={styles.aiModalOverlay} onClick={() => !aiLoading && setShowAiModal(false)}>
          <div className={styles.aiModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.aiModalTitle}>✨ AI 이미지 {thumbnail ? '수정' : '만들기'}</h3>
            <p className={styles.aiModalDesc}>
              원하는 그림 스타일이나 내용을 적어주세요. 비워두면 레시피 내용으로 그려요.
            </p>
            <textarea
              className={styles.aiModalInput}
              rows={3}
              value={aiInstruction}
              placeholder="예) 오이를 더 크게, 배경은 연한 노랑, 더 귀엽고 동글동글하게"
              onChange={e => setAiInstruction(e.target.value)}
            />
            {aiError && <p className={styles.aiModalError}>{aiError}</p>}
            <div className={styles.aiModalActions}>
              <button
                type="button"
                className={styles.aiCancel}
                onClick={() => setShowAiModal(false)}
                disabled={aiLoading}
              >취소</button>
              <button
                type="button"
                className={styles.aiGenerate}
                onClick={handleGenerateImage}
                disabled={aiLoading}
              >
                {aiLoading ? '🎨 그리는 중...' : (thumbnail ? '다시 생성' : '생성')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
