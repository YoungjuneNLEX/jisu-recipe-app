import styles from './BottomNav.module.css'

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 11.5 12 4.5l8.5 7" />
      <path d="M5.5 10.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-7.5" />
      <path d="M9.8 19.5v-4.2a2.2 2.2 0 0 1 4.4 0v4.2" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3a2 2 0 0 1 1.4.6l1 1a2 2 0 0 0 1.4.6H18.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}

function CoffeeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 8.5h12v5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5v-5Z" />
      <path d="M16.5 9.5h2a2.2 2.2 0 0 1 0 4.4h-2" />
      <path d="M8 2.8c-.5.7-.5 1.3 0 2M11.5 2.8c-.5.7-.5 1.3 0 2" />
    </svg>
  )
}

export default function BottomNav({ active, onHome, onCategories, onDongDong, onDessert, onAdd }) {
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <button
          className={`${styles.tab} ${active === 'home' ? styles.tabActive : ''}`}
          onClick={onHome}
          aria-label="홈"
        >
          <HomeIcon />
          <span className={styles.label}>홈</span>
        </button>

        <button
          className={`${styles.tab} ${active === 'categories' ? styles.tabActive : ''}`}
          onClick={onCategories}
          aria-label="카테고리"
        >
          <FolderIcon />
          <span className={styles.label}>카테고리</span>
        </button>

        <button className={styles.fab} onClick={onAdd} aria-label="레시피 추가">
          <PlusIcon />
        </button>

        <button
          className={`${styles.tab} ${active === 'dongdong' ? styles.tabActiveDongdong : ''}`}
          onClick={onDongDong}
          aria-label="동동이"
        >
          <span className={styles.dongdongIcon}>🐾</span>
          <span className={styles.label}>동동이</span>
        </button>

        <button
          className={`${styles.tab} ${active === 'dessert' ? styles.tabActive : ''}`}
          onClick={onDessert}
          aria-label="디저트"
        >
          <CoffeeIcon />
          <span className={styles.label}>디저트</span>
        </button>
      </div>
    </nav>
  )
}
