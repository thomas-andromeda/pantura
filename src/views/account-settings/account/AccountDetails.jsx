'use client'

// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'

// Context & Libs
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/libs/supabaseClient'

const AccountDetails = () => {
  // Auth Context
  const { user, profile, fetchProfile } = useAuth()

  // Design system tokens
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = isDark ? '#A78BFA' : '#7C3AED'
  const accentLight = isDark ? '#2D2650' : '#EDE9FF'
  const bgSecondary = isDark ? '#1A1830' : '#F5F4FE'
  const borderColor = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  const textSecondary = isDark ? '#9390B0' : '#6B6A85'

  // States
  const [namaLengkap, setNamaLengkap] = useState('')
  const [email, setEmail] = useState('')
  const [imgSrc, setImgSrc] = useState('/images/avatars/1.png')
  const [fileInput, setFileInput] = useState('')
  const [base64Img, setBase64Img] = useState('')
  const [saving, setSaving] = useState(false)
  const [alertMsg, setAlertMsg] = useState(null)
  const [alertSeverity, setAlertSeverity] = useState('success')

  // Populate form with real user data on load
  useEffect(() => {
    if (user) {
      setEmail(profile?.email || user?.email || '')
      setNamaLengkap(
        profile?.nama_lengkap ||
        user?.user_metadata?.nama_lengkap ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        ''
      )
      setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
      setBase64Img(profile?.foto_avatar || '')
    }
  }, [user, profile])

  const handleFileInputChange = (file) => {
    const reader = new FileReader()
    const { files } = file.target

    if (files && files.length !== 0) {
      reader.onload = () => {
        setImgSrc(reader.result)
        setBase64Img(reader.result)
      }
      reader.readAsDataURL(files[0])
    }
  }

  const handleFileInputReset = () => {
    setFileInput('')
    // Revert to database profile pic or default
    setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
    setBase64Img(profile?.foto_avatar || '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setAlertMsg(null)

    try {
      const { error } = await supabase
        .from('user')
        .update({
          nama_lengkap: namaLengkap,
          foto_avatar: base64Img || null
        })
        .eq('id', user.id)

      if (error) throw error

      await fetchProfile(user.id)
      setAlertSeverity('success')
      setAlertMsg('Profil berhasil diperbarui!')
    } catch (err) {
      console.error('Update profile error:', err.message)
      setAlertSeverity('error')
      setAlertMsg(err.message || 'Gagal memperbarui profil.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setAlertMsg(null)
    setNamaLengkap(profile?.nama_lengkap || '')
    setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
    setBase64Img(profile?.foto_avatar || '')
    setFileInput('')
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Profile Card ─────────────────────────────────── */}
      <Card sx={{ borderRadius: '16px', border: `0.5px solid ${borderColor}`, boxShadow: 'none' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography sx={{ fontSize: '15px', fontWeight: 500, mb: 3, color: 'text.primary' }}>Informasi Profil</Typography>

          {/* Avatar upload */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mb: 4 }}>
            <Box sx={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
              <Box
                component='img'
                src={imgSrc}
                alt='Avatar'
                sx={{
                  width: 80, height: 80, borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${borderColor}`
                }}
              />
              {/* Edit overlay on hover */}
              <Box
                component='label'
                htmlFor='account-settings-upload-image'
                sx={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0,
                  cursor: 'pointer',
                  transition: 'opacity 150ms ease',
                  '&:hover': { opacity: 1 }
                }}
              >
                <i className='ri-pencil-line' style={{ color: '#fff', fontSize: '1.1rem' }} />
                <input
                  hidden type='file'
                  value={fileInput}
                  accept='image/png, image/jpeg'
                  onChange={handleFileInputChange}
                  id='account-settings-upload-image'
                />
              </Box>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                Foto Profil
              </Typography>
              <Typography sx={{ fontSize: '12px', color: textSecondary, mb: 1.5 }}>
                JPG atau PNG. Ukuran maksimal 800KB.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  component='label'
                  htmlFor='account-settings-upload-image'
                  size='small'
                  sx={{
                    bgcolor: accentLight,
                    color: accent,
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontSize: '13px',
                    border: `1px solid ${borderColor}`,
                    '&:hover': { bgcolor: `${accent}20` }
                  }}
                >
                  Ganti Foto
                </Button>
                <Button
                  size='small'
                  onClick={handleFileInputReset}
                  sx={{
                    color: textSecondary,
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontSize: '13px',
                    border: `1px solid ${borderColor}`,
                    '&:hover': { color: '#DC2626', borderColor: '#DC2626' }
                  }}
                >
                  Reset
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Alert */}
          {alertMsg && (
            <Alert severity={alertSeverity} sx={{ mb: 3, borderRadius: '8px' }}>{alertMsg}</Alert>
          )}

          {/* Form fields */}
          <Box component='form' onSubmit={handleSubmit}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
              {/* Nama Lengkap */}
              <Box>
                <Typography component='label' htmlFor='nama-lengkap' sx={{
                  display: 'block', fontSize: '12px', fontWeight: 500,
                  color: textSecondary, mb: 0.75
                }}>
                  Nama Lengkap
                </Typography>
                <Box
                  component='input'
                  id='nama-lengkap'
                  type='text'
                  value={namaLengkap}
                  onChange={(e) => setNamaLengkap(e.target.value)}
                  required
                  disabled={saving}
                  placeholder='Masukkan nama lengkap Anda'
                  sx={{
                    width: '100%',
                    height: '44px',
                    px: 2,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color 150ms ease',
                    '&:focus': { borderColor: accent, boxShadow: `0 0 0 3px ${accent}20` },
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
                  }}
                />
              </Box>
              {/* Email */}
              <Box>
                <Typography component='label' sx={{
                  display: 'block', fontSize: '12px', fontWeight: 500,
                  color: textSecondary, mb: 0.75
                }}>
                  Email
                </Typography>
                <Box
                  component='input'
                  type='email'
                  value={email}
                  disabled
                  sx={{
                    width: '100%',
                    height: '44px',
                    px: 2,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    bgcolor: bgSecondary,
                    color: textSecondary,
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    cursor: 'not-allowed',
                    opacity: 0.7
                  }}
                />
              </Box>
            </Box>

            {/* Buttons */}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                type='submit'
                disabled={saving}
                sx={{
                  bgcolor: accent,
                  color: '#fff',
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontSize: '14px',
                  px: 3, py: 1,
                  '&:hover': { bgcolor: accent, filter: 'brightness(0.9)' },
                  '&:disabled': { opacity: 0.6 }
                }}
              >
                {saving ? <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} /> : null}
                Simpan Perubahan
              </Button>
              <Button
                type='button'
                onClick={handleReset}
                disabled={saving}
                sx={{
                  color: textSecondary,
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontSize: '14px',
                  px: 3, py: 1,
                  border: `1px solid ${borderColor}`,
                  '&:hover': { color: 'text.primary', bgcolor: bgSecondary }
                }}
              >
                Reset
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ─── Danger Zone Card ─────────────────────────────── */}
      <Card sx={{
        borderRadius: '16px',
        border: `1px solid rgba(220, 38, 38, 0.25)`,
        boxShadow: 'none'
      }}>
        <CardContent sx={{ p: 3 }}>
          <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#DC2626', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <i className='ri-error-warning-line' />
            Zona Bahaya
          </Typography>
          <Typography sx={{ fontSize: '13px', color: textSecondary, mb: 2.5 }}>
            Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan. Harap berhati-hati.
          </Typography>
          <Button
            variant='outlined'
            size='small'
            disabled
            sx={{
              borderColor: '#DC2626',
              color: '#DC2626',
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '13px',
              '&:hover': { bgcolor: '#FEE2E2', borderColor: '#DC2626' }
            }}
          >
            Nonaktifkan Akun
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}

export default AccountDetails
