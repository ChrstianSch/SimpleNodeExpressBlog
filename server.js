// Require modules
const express = require('express')
const mongoose = require('mongoose')
const methodOverride = require('method-override')
const favicon = require('serve-favicon')
const path = require('path')
const session = require('express-session')
const MongoDBSession = require('connect-mongodb-session')(session)
const bcrypt = require('bcryptjs')
const app = express()

// Require models
const UserModel = require('./models/user')
const Article = require('./models/article')
const { collection } = require('./models/article')

// set favicon (not working)
// app.use(favicon(path.join(__dirname, 'images','slieve-league-2704892_640.jpg')))
app.use('/images', express.static('images')) // necessary for images to display

// connect to the db
mongoose.connect('mongodb+srv://christian:WtAss3RC75@cluster0.b3wqm.mongodb.net/myFirstDatabase?retryWrites=true&w=majority', {
  useNewUrlParser: true, 
  useUnifiedTopology: true, 
  useCreateIndex: true
})

// set place for sessions to be stored
const save_session = new MongoDBSession({
  uri: 'mongodb+srv://christian:WtAss3RC75@cluster0.b3wqm.mongodb.net/myFirstDatabase?retryWrites=true&w=majority',
  collection: 'sessions'
})

// set the view engine
app.set('view engine', 'ejs')

// parser
app.use(express.urlencoded({ extended: false }))
app.use(methodOverride('_method'))

// session middleware
app.use(
  session({
    secret: "myRandomSecret123",
    resave: false,
    saveUninitialized: false,
    store: save_session
  })
)

const isAuthenticated = (req, res, next) => {
  if(req.session.isAuthenticated) {
    next()
  } else {
    res.redirect('/login')
  }
}

// Middleware for flash messages
app.use((req, res, next) => {
  res.locals.flash = req.session.sessionFlash // transfer flash msg from session to context
  delete req.session.sessionFlash // clear flash msg from session
  next()
})

// set home route
app.get('/', async (req, res) => {
  const articles = await Article.find().sort({ createdAt: 'desc' }).limit(10) // limit to last 10 posts
  var isLoggedIn = req.session.isAuthenticated
  var username = ''
  if (isLoggedIn) var username = req.session.user.username

  res.render('articles/index', { 
    articles: articles,
    isLoggedIn: isLoggedIn,
    username: username,
    sessionFlash: res.locals.flash
  })
})

// set routes for authentication
app.get('/login', (req, res) => {
  res.render('login', { sessionFlash: res.locals.flash })  
})
app.get('/register', (req, res) => {
  res.render('register', { sessionFlash: res.locals.flash })
})

// set routes for article creation/manipulation
app.get('/articles/new', isAuthenticated, (req, res) => {
  res.render('articles/new', { article: new Article() })
})
app.get('/articles/edit/:id', isAuthenticated, async (req, res) => {
  const article = await Article.findById(req.params.id)
  res.render('articles/edit', { article: article })
})

// route for displaying an article
app.get('/articles/:slug', async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug }).populate('author')
  if (article == null) res.redirect('/')
  var isLoggedIn = req.session.isAuthenticated
  res.render('articles/show', { 
    article: article,
    isLoggedIn: isLoggedIn,
    sessionFlash: res.locals.flash
   })
})

// register processing
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body
  let user = await UserModel.findOne({email})
  if(user) {
    console.log('User already exists')
    req.session.sessionFlash = {
      type: 'danger',
      message: 'Could not register Author - Author already exists.'
    }
    return res.redirect('/register')
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  user = new UserModel({
    username,
    email,
    password: hashedPassword
  })
  await user.save()

  req.session.sessionFlash = {
    type: 'success',
    message: 'Successfully registered an Author.'
  }
  res.redirect('/login')
})

// login processing
app.post('/login', async (req,res) => {
  const { email, password } = req.body

  const user = await UserModel.findOne({email})
  if(!user){
    console.log('User is not existing')
    req.session.sessionFlash = {
      type: 'danger',
      message: 'Author account is not existing.'
    }
    return res.redirect('/login')
  }

  const isMatching = await bcrypt.compare(password, user.password)
  if(!isMatching){
    console.log('Password is not matching')
    req.session.sessionFlash = {
      type: 'danger',
      message: 'Password is not matching.'
    }
    return res.redirect('/login')
  }

  req.session.isAuthenticated = true
  req.session.user = user
  req.session.sessionFlash = {
    type: 'success',
    message: 'Successfully logged in as Author.'
  }
  console.log('User is now logged in')
  res.redirect('/')
})

// logout processing
app.post('/logout', (req, res) => {
  req.session.isAuthenticated = false
  req.session.user = null
  req.session.sessionFlash = {
    type: 'success',
    message: 'Successfully logged out.'
  }
  console.log('Logged out (session destroyed)')
  res.redirect('/')
})

// processing of article manipulation - call outsourced functionality
app.post('/articles/', async (req, res, next) => {
  req.article = new Article()
  next()
}, saveArticleAndRedirect('new'))
app.put('/articles/:id', async (req, res, next) => {
  req.article = await Article.findById(req.params.id)
  next()
}, saveArticleAndRedirect('edit'))

// delete processing to delete an article in the database
app.delete('/articles/:id', isAuthenticated, async (req, res) => {
  await Article.findByIdAndDelete(req.params.id)
  req.session.sessionFlash = {
    type: 'success',
    message: 'Article deleted.'
  }
  res.redirect('/')
})

// functonality for saving an article in the database
function saveArticleAndRedirect(path) {
  return async (req, res) => {
    let article = req.article
    article.title = req.body.title
    article.description = req.body.description
    article.markdown = req.body.markdown
    article.author = req.session.user // currently logged in user is saved as author --> no field asking for author name needed
    try {
      article = await article.save()
      req.session.sessionFlash = {
        type: 'success',
        message: 'Article saved.'
      }
      res.redirect(`/articles/${article.slug}`)
    } catch (e) {
      req.session.sessionFlash = {
        type: 'danger',
        message: 'Could not save article.'
      }
      res.render(`articles/${path}`, {
         article: article,
         sessionFlash: res.locals.flash
        })
    }
  }
}

app.listen(3000)
