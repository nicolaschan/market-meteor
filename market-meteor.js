const taxUsername = 'Tax';
const taxRate = 0.05;

Router.configure({
  layoutTemplate: 'main'
});

Router.onBeforeAction(function() {
  if (!Meteor.userId()) {
    Router.go('/login');
  } else {
    this.next();
  }
}, {
  except: ['login', 'register']
});
Router.onBeforeAction(function() {
  if (Meteor.userId()) {
    Router.go('/');
  } else {
    this.next();
  }
}, {
  only: ['login', 'register']
});

BankAccounts = new Mongo.Collection('bankAccounts');
Transactions = new Mongo.Collection('transactions');
Messages = new Mongo.Collection('messages');
Items = new Mongo.Collection('items');
Receipts = new Mongo.Collection('receipts');

Router.route('/', function() {
  this.render('dashboard');
});
Router.route('/login', function() {
  this.render('login');
});
Router.route('/register', function() {
  this.render('register');
});
Router.route('/my-profile', function() {
  this.render('myProfile');
});
Router.route('/store');
Router.route('/store/:item', function() {

});
Router.route('/messages', function() {
  if (Session.get('selectedUser'))
    Router.go('/messages/' + Session.get('selectedUser'));
  this.render('messages');
});
Router.route('/messages/:username', function() {
  Session.set('selectedUser', this.params.username);
  this.render('messages');
});
Router.route('/users');
Router.route('/money');
Router.route('/transactions');
Router.route('/profile/:username', function() {
  var username = this.params.username;
  this.render('profile', {
    data: function() {
      var user = Meteor.users.findOne({
        username: username
      });
      if (!user)
        return;
      var userId = user._id;
      var bankAccount = BankAccounts.findOne({
        owner: userId
      });
      return {
        username: username,
        tagline: bankAccount.tagline,
        description: bankAccount.description,
        image: bankAccount.image
      }
    }
  });
});
Router.route('/purchases', function() {
  this.render('receipts');
});

Meteor.methods({
  addBankAccount: function() {
    BankAccounts.insert({
      owner: Meteor.userId(),
      balance: 10000,
      tagline: 'A market user',
      description: '',
      image: 'https://i.imgur.com/ToHNDzr.jpg',
      trusted: false
    });
  },
  addItem: function(name, image, quantity, price, description, instructions) {
    if (!name)
      return Meteor.call('toast', 'error', 'Item name missing.');
    if (!image)
      image = 'https://i.imgur.com/ggnNZ2L.jpg';
    if (isNaN(quantity))
      quantity = 0;
    if (isNaN(price))
      price = 0;
    Items.insert({
      name: name,
      image: image,
      quantity: parseInt(quantity),
      price: parseInt(price * 100),
      description: description,
      instructions: instructions,
      owner: Meteor.userId()
    });
  },
  deleteItem: function(id) {
    Items.remove({
      _id: id,
      owner: Meteor.userId()
    });
  },
  editItem: function(id, name, image, quantity, price, description, instructions) {
    Items.update({
      _id: id,
      owner: Meteor.userId()
    }, {
      $set: {
        name: name,
        image: image,
        quantity: parseInt(quantity),
        price: parseInt(price * 100),
        description: description,
        instructions: instructions
      }
    });
  },
  editAccount: function(image, tagline, description) {
    BankAccounts.update({
      owner: Meteor.userId()
    }, {
      $set: {
        image: image,
        tagline: tagline,
        description: description
      }
    });
  },
  sendMessage: function(to, message) {
    if (!Meteor.userId())
      throw new Meteor.Error('not-authorized');
    if (!message)
      return Materialize.toast('Message is empty.', 4000, 'red');
    Messages.insert({
      message: message,
      sentAt: new Date(),
      from: Meteor.userId(),
      from_username: Meteor.user().username,
      to: Meteor.users.findOne({
        username: to
      })._id,
      to_username: to
    });
  },
  toast: function(type, message) {
    if (Meteor.isClient) {
      if (type === 'error')
        return Materialize.toast(message, 4000, 'red');
      if (type === 'success')
        return Materialize.toast(message, 4000, 'green');
    }
  },
  sendMoney: function(to, amount, memo) {
    if ((amount <= 0) || (amount * 100 !== parseInt(amount * 100)))
      return Materialize.toast('Invalid amount.', 4000, 'red');
    amount = parseInt(amount * 100);

    var currentAccount = BankAccounts.findOne({
      owner: Meteor.userId()
    });
    var recipient = Meteor.users.findOne({
      username: to
    });
    if (!recipient)
      return Materialize.toast('Recipient not found.', 4000, 'red');
    var recipientId = recipient._id;
    var recipientAccount = BankAccounts.findOne({
      owner: recipientId
    });

    var taxUser = Meteor.users.findOne({
      username: taxUsername
    });
    if (taxUser) {
      var taxId = taxUser._id;
      var calculateTax = function(amount) {
        return Math.ceil(amount * taxRate);
      };
      if (currentAccount.balance < (amount + calculateTax(amount)))
        return Materialize.toast('Not enough funds.', 4000, 'red');
      BankAccounts.update({
        owner: Meteor.userId()
      }, {
        $inc: {
          balance: (amount + calculateTax(amount)) * -1
        }
      });
      BankAccounts.update({
        owner: recipientId
      }, {
        $inc: {
          balance: amount
        }
      });
      BankAccounts.update({
        owner: taxId
      }, {
        $inc: {
          balance: calculateTax(amount)
        }
      });
      Transactions.insert({
        to: recipientId,
        from: Meteor.userId(),
        amount: amount / 100,
        date: new Date(),
        memo: memo,
        tax: calculateTax(amount) / 100
      });
    } else {
      if (currentAccount.balance < amount)
        return Materialize.toast('Not enough funds.', 4000, 'red');;
      BankAccounts.update({
        owner: Meteor.userId()
      }, {
        $inc: {
          balance: amount * -1
        }
      });
      BankAccounts.update({
        owner: recipientId
      }, {
        $inc: {
          balance: amount
        }
      });
      Transactions.insert({
        to: recipientId,
        from: Meteor.userId(),
        amount: amount / 100,
        date: new Date(),
        memo: memo,
        tax: 0
      });
    }
    Meteor.call('toast', 'success', `$${amount / 100} successfully sent!`);
    return true;
  },
  buyItem: function(itemId, quantity) {
    var item = Items.findOne({
      _id: itemId
    });
    if (!item)
      return Materialize.toast('Could not find item.', 4000, 'red');
    if (quantity < 1 || quantity > item.quantity)
      return Materialize.toast('Invalid quantity.', 4000, 'red');
    var seller = Meteor.users.findOne({
      _id: item.owner
    }).username;

    if (Meteor.call('sendMoney', seller, item.price * quantity / 100, `Purchase of ${item.name}`)) {
      Items.update({
        _id: itemId
      }, {
        $inc: {
          quantity: (-1 * quantity)
        }
      });
      Receipts.insert({
        buyer: Meteor.userId(),
        seller: item.owner,
        quantity: quantity,
        price: item.price,
        name: item.name,
        description: item.description,
        date: new Date()
      });
      return Meteor.call('toast', 'success', 'Item successfully purchased!');
    } else {
      return Meteor.call('toast', 'error', 'Purchase failed.');
    }
  }
});

if (Meteor.isClient) {
  Meteor.subscribe('users');
  Meteor.subscribe('messages');
  Meteor.subscribe('bankAccounts');
  Meteor.subscribe('transactions');
  Meteor.subscribe('items');
  Meteor.subscribe('receipts');

  Template.register.events({
    'submit form': (event) => {
      event.preventDefault();
      var username = event.target.username.value;
      var password = event.target.password.value;

      Accounts.createUser({
        username: username,
        password: password
      }, (err) => {
        if (!err)
          Meteor.call('addBankAccount');
        else
          Materialize.toast(err.reason, 4000, 'red');
      });
    }
  });
  Template.login.events({
    'submit form': (event) => {
      event.preventDefault();
      var username = event.target.username.value;
      var password = event.target.password.value;

      Meteor.loginWithPassword(username, password, function(err) {
        if (err)
          Materialize.toast(err.reason, 4000, 'red');
      });
    }
  });

  Template.myProfile.helpers({
    account: function() {
      return BankAccounts.findOne({
        owner: Meteor.userId()
      });
    }
  });
  Template.myProfile.events({
    'submit form': (event) => {
      event.preventDefault();
      var image = event.target.image.value;
      var tagline = event.target.tagline.value;
      var description = event.target.description.value;
      Meteor.call('editAccount', image, tagline, description);
    }
  });

  Template.dashboard.helpers({
    balance: function() {
      var account = BankAccounts.findOne({
        owner: Meteor.userId()
      });
      if (account)
        return account.balance / 100;
    }
  });

  Template.users.helpers({
    users: function() {
      var users = [];
      var bankAccounts = BankAccounts.find({}, {
        sort: {
          balance: -1
        }
      }).fetch();
      for (var i in bankAccounts) {
        var user = Meteor.users.findOne({
          _id: bankAccounts[i].owner
        });
        if (!user)
          break;
        user.balance = bankAccounts[i].balance / 100;
        user.tagline = bankAccounts[i].tagline;
        user.trusted = bankAccounts[i].trusted;
        users.push(user);
      }
      return users;
    }
  });

  Template.money.helpers({
    balance: function() {
      var account = BankAccounts.findOne({
        owner: Meteor.userId()
      });
      if (account)
        return account.balance / 100;
    },
    transactions: function() {
      return Transactions.find({}, {
        sort: {
          date: -1
        },
        limit: 4
      });
    }
  });
  Template.money.events({
    'submit form': (event) => {
      event.preventDefault();
      var to = event.target.to.value;
      var amount = event.target.amount.value;
      var memo = event.target.memo.value;
      Meteor.call('sendMoney', to, amount, memo);
      event.target.reset();
      Materialize.updateTextFields();
    }
  });

  Template.receipts.helpers({
    receipts: function() {
      var receipts = Receipts.find({}, {
        sort: {
          date: -1
        }
      }).fetch();
      if (!receipts)
        return null;
      for (var i in receipts) {
        receipts[i].buyer_username = Meteor.users.findOne({
          _id: receipts[i].buyer
        }).username;
        receipts[i].seller_username = Meteor.users.findOne({
          _id: receipts[i].seller
        }).username;
        receipts[i].price /= 100;
      }
      return receipts;
    }
  });

  Template.transactions.helpers({
    transactions: function() {
      return Transactions.find({}, {
        sort: {
          date: -1
        }
      });
    }
  });
  Template.transaction.helpers({
    isCurrentUser: function(id) {
      return id === Meteor.userId();
    },
    getUsername: function(id) {
      return Meteor.users.findOne({
        _id: id
      }).username;
    }
  });

  Template.store.helpers({
    items: function() {
      var items = (Session.get('viewMyItems')) ? Items.find({
        owner: Meteor.userId()
      }).fetch() : Items.find({
        owner: {
          $not: Meteor.userId()
        }
      }).fetch();
      for (var i in items) {
        items[i].owner_username = Meteor.users.findOne({
          _id: items[i].owner
        }).username;
        items[i].price /= 100;
      }
      return items;
    },
    getQuantity: function() {
      return Session.get('confirmQuantity');
    },
    maxQuantity: function() {
      var item = Items.findOne({
        _id: Session.get('selectedItem')
      });
      if (!item)
        return;
      return item.quantity;
    },
    getTotalPrice: function() {
      var item = Items.findOne({
        _id: Session.get('selectedItem')
      });
      if (!item)
        return;
      var total = item.price * Session.get('confirmQuantity') / 100;
      if (isNaN(total))
        return null;
      return total;
    },
    viewMyItems: function() {
      return Session.get('viewMyItems');
    }
  });
  Template.store.events({
    'submit #addItem': (event) => {
      event.preventDefault();
      var name = event.target.name.value;
      var image = event.target.image.value;
      var quantity = event.target.quantity.value;
      var price = event.target.price.value;
      var description = event.target.description.value;
      var instructions = event.target.instructions.value;
      Meteor.call('addItem', name, image, quantity, price, description, instructions);
      event.target.reset();
      Materialize.updateTextFields();
      Session.set('viewMyItems', true);
    },
    'click #other': (event) => {
      Session.set('viewMyItems', false);
    },
    'click #my': (event) => {
      Session.set('viewMyItems', true);
    },
    'click #confirmQuantity, keyup #confirmQuantity': (event) => {
      Session.set('confirmQuantity', parseInt($(event.target).val()));
    },
    'submit #confirmForm': (event) => {
      event.preventDefault();
      Meteor.call('buyItem', Session.get('selectedItem'), Session.get('confirmQuantity'));
    }
  });
  Template.item.helpers({
    isCurrentUser: function(id) {
      return id === Meteor.userId();
    }
  });
  Template.item.events({
    'click .buy-item': (event) => {
      Session.set('confirmQuantity', 1);
      $('#confirmQuantity').val(1);
      Materialize.updateTextFields();
      Session.set('selectedItem', event.target.getAttribute('item'));
    },
    'submit #editItem': (event) => {
      event.preventDefault();
      var name = event.target.name.value;
      var image = event.target.image.value;
      var quantity = event.target.quantity.value;
      var price = event.target.price.value;
      var description = event.target.description.value;
      var instructions = event.target.instructions.value;
      Meteor.call('editItem', event.target.submit.getAttribute('item'), name, image, quantity, price, description, instructions);
    },
    'click .item-delete': (event) => {
      Meteor.call('deleteItem', event.target.getAttribute('item'));
    }
  });

  Template.messages.helpers({
    selectedUser: function() {
      return Session.get('selectedUser');
    },
    users: function() {
      return Meteor.users.find({
        _id: {
          $not: Meteor.userId()
        }
      });
    },
    messages: function() {
      return Messages.find({
        $or: [{
          from_username: Session.get('selectedUser')
        }, {
          to_username: Session.get('selectedUser')
        }]
      }, {
        limit: 16,
        sort: {
          sentAt: -1
        }
      }).fetch().reverse();
    }
  });
  Deps.autorun(function() {
    var selectedUser = Session.get('selectedUser');
    Messages.find({
      $or: [{
        from_username: Session.get('selectedUser')
      }, {
        to_username: Session.get('selectedUser')
      }]
    }).observeChanges({
      added: function(id, fields) {
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
      }
    });
  });
  Template.messages.events({
    'click .user-select': (event) => {
      $('#messages').scrollTop($('#messages')[0].scrollHeight);
    },
    'submit form': (event) => {
      event.preventDefault();
      var message = event.target.message.value;
      Meteor.call('sendMessage', Session.get('selectedUser'), message);
      event.target.message.value = '';
    }
  });
  Template.user.helpers({
    isSelectedUser: function(username) {
      if (!Session.get('selectedUser'))
        return false;
      return Session.get('selectedUser') === username;
    }
  });

  Template.accountDropdown.onRendered(() => {
    this.$('.dropdown-button').dropdown({
      belowOrigin: true
    });
  });

  Template.main.events({
    'click .logout': (event) => {
      event.preventDefault();
      Meteor.logout();
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function() {
    // code to run on server at startup
  });

  Meteor.publish('users', function() {
    return Meteor.users.find({}, {
      fields: {
        username: 1
      }
    });
  });
  Meteor.publish('messages', function() {
    return Messages.find({
      $or: [{
        to: this.userId
      }, {
        from: this.userId
      }]
    });
  });
  Meteor.publish('bankAccounts', function() {
    return BankAccounts.find({});
  });
  Meteor.publish('transactions', function() {
    return Transactions.find({
      $or: [{
        to: this.userId
      }, {
        from: this.userId
      }]
    });
  });
  Meteor.publish('items', function() {
    return Items.find({
      $or: [{
        owner: this.userId
      }, {
        quantity: {
          $gt: 0
        }
      }]
    });
  });
  Meteor.publish('receipts', function() {
    return Receipts.find({
      $or: [{
        buyer: this.userId
      }, {
        seller: this.userId
      }]
    });
  });
}