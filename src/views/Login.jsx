'use client'

// React Imports
import { useState, useEffect } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

// Component Imports
import Logo from '@components/layout/shared/Logo'
import Illustrations from '@components/Illustrations'

// Hook Imports
import { useImageVariant } from '@core/hooks/useImageVariant'

// Supabase Import
import { supabase } from '@/libs/supabaseClient'

const Login = ({ mode }) => {
  // States
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Vars
  const darkImg = '/images/pages/auth-v1-mask-dark.png'
  const lightImg = '/images/pages/auth-v1-mask-light.png'

  // Hooks
  const router = useRouter()
  const searchParams = useSearchParams()
  const authBackground = useImageVariant(mode, lightImg, darkImg)

  useEffect(() => {
    if (searchParams.get('error') === 'auth_callback_error') {
      setErrorMsg('Gagal melakukan autentikasi via Google. Silakan coba lagi.')
    }
  }, [searchParams])

  const handleClickShowPassword = () => setIsPasswordShown(show => !show)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setErrorMsg(err.message || 'Gagal masuk. Silakan periksa kembali email dan password Anda.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setErrorMsg('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err) {
      setErrorMsg(err.message || 'Gagal terhubung dengan Google.')
      setLoading(false)
    }
  }

  return (
    <div className='flex flex-col justify-center items-center min-bs-[100dvh] relative p-6'>
      <Card className='flex flex-col sm:is-[450px]'>
        <CardContent className='p-6 sm:!p-12'>
          <Link href='/' className='flex justify-center items-center mbe-6'>
            <Logo />
          </Link>
          <div className='flex flex-col gap-5'>
            <div>
              <Typography variant='h4'>Selamat Datang!</Typography>
              <Typography className='mbs-1'>Masuk ke akun kamu untuk memantau sensor IoT</Typography>
            </div>

            {errorMsg && (
              <Alert severity='error' className='mbe-2'>
                {errorMsg}
              </Alert>
            )}

            <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
              <TextField
                autoFocus
                fullWidth
                label='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <TextField
                fullWidth
                label='Password'
                id='outlined-adornment-password'
                type={isPasswordShown ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        edge='end'
                        onClick={handleClickShowPassword}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <i className={isPasswordShown ? 'ri-eye-off-line' : 'ri-eye-line'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <div className='flex justify-between items-center gap-x-3 gap-y-1 flex-wrap'>
                <FormControlLabel control={<Checkbox />} label='Ingat saya' disabled={loading} />
                <Typography className='text-end' color='primary' component={Link} href='/forgot-password'>
                  Lupa password?
                </Typography>
              </div>
              <Button
                fullWidth
                variant='contained'
                type='submit'
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} color='inherit' />}
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </Button>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>Belum punya akun?</Typography>
                <Typography component={Link} href='/register' color='primary'>
                  Daftar di sini
                </Typography>
              </div>
              <Divider className='gap-3'>atau</Divider>
              <div className='flex justify-center items-center gap-2'>
                <Button
                  fullWidth
                  variant='outlined'
                  color='secondary'
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  startIcon={<i className='ri-google-fill' style={{ color: '#db4437' }} />}
                >
                  Masuk dengan Google
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
      <Illustrations maskImg={{ src: authBackground }} />
    </div>
  )
}

export default Login
