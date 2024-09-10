const supabase = require('./supabase');
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());


app.get('/contact/:contact_id/messages', async (req, res) => {
  const { contact_id } = req.params;
  const { userId } = req.query;

  try {
    // Récupérer les informations du contact
    const { data: userData, error: userError } = await supabase
      .from('users_infos')
      .select('avatar, username, badge')
      .eq('uuid', contact_id)
      .single();

    if (userError) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des infos utilisateur.' });
    }

    // Récupérer les messages entre les deux utilisateurs
    const { data: messages, error: messageError } = await supabase
      .from('message')
      .select()
      .or(`and(fromid.eq.${userId},toid.eq.${contact_id}),and(fromid.eq.${contact_id},toid.eq.${userId})`)
      .order('id', { ascending: true });

    if (messageError) {
      return res.status(500).json( messageError );
    }

      const {data: Update } = await supabase
        .from('message')
        .update({ statue: true })
        .eq('fromid', contact_id)
        .eq('toid', userId)

    // Réponse avec les données de contact et messages
    res.status(200).json({
      contactInfo: userData,
      messages: messages || [],
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des données:', error.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});




app.get('/api/UserSearch/:username', async (req, res) => {
    try {
        const { username } = req.params; // Fix the parameter name (use "username" instead of "userName")

        const { data: userData, error: userError } = await supabase
            .from('users_infos')
            .select('uuid, username, avatar, badge')
            .like('username', '%'+username+'%');

        if (userError) {
            throw userError;
        }

        if (!userData || userData.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json(userData);
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});


app.get('/api/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params; // Récupérer l'ID de l'utilisateur principal depuis les paramètres de la requête

        // Récupérer les données de l'utilisateur principal
        const { data: userData, error: userError } = await supabase
            .from('users_infos')
            .select('username, uuid, avatar, bios, badge, image_updated_at')
            .eq('uuid', userId)
            .single();

        if (userError) {
            throw userError;
        }

        // Récupérer les données des utilisateurs suivis par l'utilisateur principal dans la table "follow"
        const { data: followData, error: followError } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId)
            .limit(5); // Limiter à 5 utilisateurs suivis

        if (followError) {
            throw followError;
        }

        // Récupérer les détails des utilisateurs suivis
        const followIds = followData.map(follow => follow.toid);
        const { data: followUserData, error: followUserError } = await supabase
            .from('users_infos')
            .select('username, uuid, avatar, badge')
            .in('uuid', followIds);

        if (followUserError) {
            throw followUserError;
        }

        // Récupérer le nombre de personnes que l'utilisateur suit (followers)
        const { data: followersCountData, error: followersCountError } = await supabase
            .from('follow')
            .select('*')
            .eq('toid', userId);

        if (followersCountError) {
            throw followersCountError;
        }

        // Récupérer le nombre de personnes qui suivent l'utilisateur (following)
        const { data: followingCountData, error: followingCountError } = await supabase
            .from('follow')
            .select('*')
            .eq('fromid', userId);

        if (followingCountError) {
            throw followingCountError;
        }

        // Récupérer le nombre de posts de type "image"
        const { data: imagePostsData, error: imagePostsError } = await supabase
            .from('post')
            .select('id, src')
            .eq('type', 'post')
            .eq('uuid', userId);

        if (imagePostsError) {
            throw imagePostsError;
        }

        // Récupérer le nombre de posts de type "shorts"
        const { data: shortsPostsData, error: shortsPostsError } = await supabase
            .from('post')
            .select('id, src, text')
            .eq('type', 'video')
            .eq('uuid', userId);

        if (shortsPostsError) {
            throw shortsPostsError;
        }

        // Récupérer le nombre de posts de type "ripple"
        const { data: ripplePostsData, error: ripplePostsError } = await supabase
            .from('post')
            .select('id, text')
            .eq('type', 'note')
            .eq('uuid', userId);

        if (ripplePostsError) {
            throw ripplePostsError;
        }

        // Organiser les données pour la réponse
        const responseData = {
            user: userData,
            follows: followUserData,
            followersCount: followersCountData.length,
            followingCount: followingCountData.length,
            PostsCount: imagePostsData.length + shortsPostsData.length + ripplePostsData.length,
            PostImage: imagePostsData,
            PostVideo: shortsPostsData,
            PostRipple: ripplePostsData,
        };

        res.send(responseData);
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});






app.get('/api/contact/:userId', async (req, res) => {
    
    try {
        const userId = req.params.userId;

        // Interroger la base de données Supabase pour récupérer les utilisateurs suivis par userId
        const { data, error } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId);

        if (error) {
            console.error('Erreur lors de la requête Supabase:', error.message);
            return res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
        }

        // Extraire les IDs des utilisateurs suivis
        const followedUserIds = data.map(item => item.toid);

        const usersInfoPromises = followedUserIds.map(async id => {
            // Récupérer le dernier message du contact dont le statut est faux (false)
            const { data: lastMessageData, error: lastMessageError } = await supabase
                .from('message')
                .select('message, created_at')
                .or(`and(fromid.eq.${id},toid.eq.${userId}),and(fromid.eq.${userId},toid.eq.${id})`)
                .order('created_at', { ascending: false })
                .limit(1)
            if (lastMessageError) {
                throw lastMessageError;
            }

            // Compter le nombre total de messages pour chaque contact
            const { data: messageCountData, error: messageCountError } = await supabase
                .from('message')
                .select('id')
                .eq('statue', false)
                .eq('toid', userId)
                .eq('fromid', id);

            if (messageCountError) {
                throw messageCountError;
            }

            const { data: contactuserinfos , error: contactuserinfoserror} = await supabase
                .from('users_infos')
                .select('username, avatar, uuid, image_updated_at')
                .eq('uuid', id)
                .single();

            if(contactuserinfoserror) {
                throw contactuserinfoserror;
            }
            return {
                userInfo: contactuserinfos,
                lastMessage: lastMessageData,
                messageCount: messageCountData.length,
            };
        });

        // Attendre que toutes les requêtes pour les informations des utilisateurs suivis soient terminées
        const usersInfoResults = await Promise.all(usersInfoPromises);
        const totalMessages = usersInfoResults.reduce((acc, cur) => acc + cur.messageCount, 0);
        // Trier les contacts par ordre décroissant de la date du dernier message
        const sortedContacts = usersInfoResults.sort((a, b) => {
            const lastMessageA = a.lastMessage[0]; // Supposant qu'il y a toujours un dernier message
            const lastMessageB = b.lastMessage[0]; // Supposant qu'il y a toujours un dernier message

            if (!lastMessageA || !lastMessageB) {
                return 0; // Si l'un des contacts n'a pas de dernier message, la comparaison est neutre
            }

            // Comparer les dates des derniers messages pour le tri
            return new Date(lastMessageB.created_at) - new Date(lastMessageA.created_at);
        });

        res.status(200).json({ contacts: sortedContacts, totalMessages });

    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});

app.get('/api/posts/following/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Récupérer les utilisateurs suivis par userId
        const { data: followedUsersData, error: followedUsersError } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId);

        if (followedUsersError) {
            console.error('Erreur lors de la requête Supabase pour récupérer les utilisateurs suivis:', followedUsersError.message);
            return res.status(500).send('Erreur lors de la récupération des utilisateurs suivis depuis Supabase.');
        }

        // Extraire les IDs des utilisateurs suivis
        const followedUserIds = followedUsersData.map(item => item.toid);

        // Récupérer tous les posts des utilisateurs suivis depuis la table posts
        const { data: allPostsData, error: allPostsError } = await supabase
            .from('posts')
            .select('id, src, text, type, tage, hashtag, uuid') // Ajouter uuid pour récupérer l'ID de l'utilisateur associé à chaque post
            .in('uuid', followedUserIds);

        if (allPostsError) {
            console.error('Erreur lors de la récupération des posts depuis Supabase:', allPostsError.message);
            return res.status(500).send('Erreur lors de la récupération des posts depuis Supabase.');
        }

        // Récupérer les informations de chaque utilisateur qui a posté un message
        const usersInfoPromises = allPostsData.map(async post => {
            const { data: userInfo, error: userError } = await supabase
                .from('users_infos')
                .select('username, avatar, badge, image_updated_at')
                .eq('uuid', post.uuid)
                .single();

            if (userError) {
                console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                return null; // Ignorer cet utilisateur s'il y a une erreur
            }

            return { username: userInfo.username, avatar: userInfo.avatar, badge: userInfo.badge };
        });

        // Attendre que toutes les requêtes pour les informations des utilisateurs soient terminées
        const usersInfoResults = await Promise.all(usersInfoPromises);

        // Ajouter les informations de l'utilisateur à chaque post
        allPostsData.forEach((post, index) => {
            post.user = usersInfoResults[index];
        });

        // Récupérer le nombre de likes pour chaque post depuis la table likes
        const likesPromises = allPostsData.map(async post => {
            const { data: likesData, error: likesError } = await supabase
                .from('like')
                .select('id')
                .eq('post_id', post.id);

            if (likesError) {
                console.error('Erreur lors de la récupération des likes depuis Supabase:', likesError.message);
                return 0; // Retourner 0 likes en cas d'erreur
            }

            return likesData.length; // Nombre de likes pour ce post
        });

        // Attendre que toutes les requêtes pour les likes soient terminées
        const likesResults = await Promise.all(likesPromises);

        // Ajouter le nombre de likes à chaque post
        allPostsData.forEach((post, index) => {
            post.likesCount = likesResults[index];
        });


        
        // Vérifier si l'utilisateur a déjà aimé chaque post
        const userLikesPromises = allPostsData.map(async post => {
            const { data: userLikesData, error: userLikesError } = await supabase
                .from('like')
                .select('id')
                .eq('post_id', post.id)
                .eq('user_id', userId);

            if (userLikesError) {
                console.error('Erreur lors de la récupération des likes de l\'utilisateur depuis Supabase:', userLikesError.message);
                return false; // Retourner false en cas d'erreur ou si l'utilisateur n'a pas aimé le post
            }

            return userLikesData.length > 0; // Vrai si l'utilisateur a aimé le post, faux sinon
        });

        // Attendre que toutes les requêtes pour les likes de l'utilisateur soient terminées
        const userLikesResults = await Promise.all(userLikesPromises);

        // Ajouter l'information si l'utilisateur a aimé chaque post
        allPostsData.forEach((post, index) => {
            post.userLiked = userLikesResults[index];
        });

        // Sélectionner un commentaire aléatoire pour chaque post
        const randomCommentsPromises = allPostsData.map(async post => {
            const { data: randomCommentData, error: randomCommentError } = await supabase
                .from('comments')
                .select('comment')
                .eq('post_id', post.id)
                .limit(1)

            if (randomCommentError) {
                console.error('Erreur lors de la récupération d\'un commentaire aléatoire depuis Supabase:', randomCommentError.message);
                return null; // Retourner null en cas d'erreur
            }

            return randomCommentData[0]?.comment || null; // Commentaire aléatoire ou null s'il n'y a pas de commentaire
        });

        // Attendre que toutes les requêtes pour les commentaires aléatoires soient terminées
        const randomCommentsResults = await Promise.all(randomCommentsPromises);

        // Ajouter le commentaire aléatoire à chaque post
        allPostsData.forEach((post, index) => {
            post.randomComment = randomCommentsResults[index];
        });

        // Récupérer le nombre de commentaires pour chaque post depuis la table comments
        const commentsPromises = allPostsData.map(async post => {
            const { data: commentsData, error: commentsError } = await supabase
                .from('comments')
                .select('id')
                .eq('post_id', post.id);

            if (commentsError) {
                console.error('Erreur lors de la récupération des commentaires depuis Supabase:', commentsError.message);
                return 0; // Retourner 0 commentaires en cas d'erreur
            }

            return commentsData.length; // Nombre de commentaires pour ce post
        });

        // Attendre que toutes les requêtes pour les commentaires soient terminées
        const commentsResults = await Promise.all(commentsPromises);

        // Ajouter le nombre de commentaires à chaque post
        allPostsData.forEach((post, index) => {
            post.commentsCount = commentsResults[index];
        });

        
        // Insérer un post publicitaire (ads) après chaque groupe de deux posts
        const postsWithAds = [];
        for (let i = 0; i < allPostsData.length; i++) {
            postsWithAds.push(allPostsData[i]);
            if ((i + 1) % 4 === 0 && i !== allPostsData.length - 1) {
                // Récupérer un post publicitaire (ads) aléatoire depuis la table adsrandom
                const { data: adsData, error: adsError } = await supabase
                    .from('ads_random')
                    .select('id, title, description, ad_type, src, uuid, website, country')
                    .limit(1);

                if (adsError) {
                    console.error('Erreur lors de la récupération du post publicitaire depuis Supabase:', adsError.message);
                    return res.status(500).send(adsError);
                }

                const adData = adsData[0]; // Récupérer les données du post publicitaire

                // Récupérer les informations de l'utilisateur qui a posté le post publicitaire
                const { data: userData, error: userError } = await supabase
                    .from('users_infos')
                    .select('username, avatar, badge') // Ajouter les champs que vous souhaitez récupérer
                    .eq('uuid', adData.uuid)
                    .single();

                if (userError) {
                    console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                    return res.status(500).send('Erreur lors de la récupération des informations utilisateur depuis Supabase.');
                }

                // Ajouter les informations de l'utilisateur à l'annonce publicitaire
                postsWithAds.push({
                    id: adData.id,
                    uuid: adData.uuid,
                    title: adData.title,
                    content: adData.description,
                    type: adData.ad_type,
                    url: adData.URL,
                    website: adData.website,
                    user: { username: userData.username, avatar: userData.avatar, badge: userData.badge, updated_at: userData.image_updated_at }
                });
            }
        }


        res.status(200).json({ posts: postsWithAds });
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});





app.get('/api/shorts/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Récupérer tous les posts des utilisateurs suivis depuis la table posts
        const { data: allPostsData, error: allPostsError } = await supabase
            .from('posts')
            .select('id, src, text, type, tage, hashtag, uuid') // Ajouter uuid pour récupérer l'ID de l'utilisateur associé à chaque post
            .eq('type', 'video')

        if (allPostsError) {
            console.error('Erreur lors de la récupération des posts depuis Supabase:', allPostsError.message);
            return res.status(500).send('Erreur lors de la récupération des posts depuis Supabase.');
        }

        // Récupérer les informations de chaque utilisateur qui a posté un message
        const usersInfoPromises = allPostsData.map(async post => {
            const { data: userInfo, error: userError } = await supabase
                .from('users_infos')
                .select('uuid, username, avatar, badge')
                .eq('uuid', post.uuid)
                .single();

            if (userError) {
                console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                return null; // Ignorer cet utilisateur s'il y a une erreur
            }

            return { username: userInfo.username, avatar: userInfo.avatar, badge: userInfo.badge };
        });

        // Attendre que toutes les requêtes pour les informations des utilisateurs soient terminées
        const usersInfoResults = await Promise.all(usersInfoPromises);

        // Ajouter les informations de l'utilisateur à chaque post
        allPostsData.forEach((post, index) => {
            post.user = usersInfoResults[index];
        });

        // Récupérer le nombre de likes pour chaque post depuis la table likes
        const likesPromises = allPostsData.map(async post => {
            const { data: likesData, error: likesError } = await supabase
                .from('like')
                .select('id')
                .eq('post_id', post.id);

            if (likesError) {
                console.error('Erreur lors de la récupération des likes depuis Supabase:', likesError.message);
                return 0; // Retourner 0 likes en cas d'erreur
            }

            return likesData.length; // Nombre de likes pour ce post
        });

        // Attendre que toutes les requêtes pour les likes soient terminées
        const likesResults = await Promise.all(likesPromises);

        // Ajouter le nombre de likes à chaque post
        allPostsData.forEach((post, index) => {
            post.likesCount = likesResults[index];
        });


        
        // Vérifier si l'utilisateur a déjà aimé chaque post
        const userLikesPromises = allPostsData.map(async post => {
            const { data: userLikesData, error: userLikesError } = await supabase
                .from('like')
                .select('id')
                .eq('post_id', post.id)
                .eq('user_id', userId);

            if (userLikesError) {
                console.error('Erreur lors de la récupération des likes de l\'utilisateur depuis Supabase:', userLikesError.message);
                return false; // Retourner false en cas d'erreur ou si l'utilisateur n'a pas aimé le post
            }

            return userLikesData.length > 0; // Vrai si l'utilisateur a aimé le post, faux sinon
        });

        // Attendre que toutes les requêtes pour les likes de l'utilisateur soient terminées
        const userLikesResults = await Promise.all(userLikesPromises);

        // Ajouter l'information si l'utilisateur a aimé chaque post
        allPostsData.forEach((post, index) => {
            post.userLiked = userLikesResults[index];
        });

        // Sélectionner un commentaire aléatoire pour chaque post
        const randomCommentsPromises = allPostsData.map(async post => {
            const { data: randomCommentData, error: randomCommentError } = await supabase
                .from('comments')
                .select('comment')
                .eq('post_id', post.id)
                .limit(1)

            if (randomCommentError) {
                console.error('Erreur lors de la récupération d\'un commentaire aléatoire depuis Supabase:', randomCommentError.message);
                return null; // Retourner null en cas d'erreur
            }

            return randomCommentData[0]?.comment || null; // Commentaire aléatoire ou null s'il n'y a pas de commentaire
        });

        // Attendre que toutes les requêtes pour les commentaires aléatoires soient terminées
        const randomCommentsResults = await Promise.all(randomCommentsPromises);

        // Ajouter le commentaire aléatoire à chaque post
        allPostsData.forEach((post, index) => {
            post.randomComment = randomCommentsResults[index];
        });

        // Récupérer le nombre de commentaires pour chaque post depuis la table comments
        const commentsPromises = allPostsData.map(async post => {
            const { data: commentsData, error: commentsError } = await supabase
                .from('comments')
                .select('id')
                .eq('post_id', post.id);

            if (commentsError) {
                console.error('Erreur lors de la récupération des commentaires depuis Supabase:', commentsError.message);
                return 0; // Retourner 0 commentaires en cas d'erreur
            }

            return commentsData.length; // Nombre de commentaires pour ce post
        });

        // Attendre que toutes les requêtes pour les commentaires soient terminées
        const commentsResults = await Promise.all(commentsPromises);

        // Ajouter le nombre de commentaires à chaque post
        allPostsData.forEach((post, index) => {
            post.commentsCount = commentsResults[index];
        });

        
        // Insérer un post publicitaire (ads) après chaque groupe de deux posts
        const postsWithAds = [];
        for (let i = 0; i < allPostsData.length; i++) {
            postsWithAds.push(allPostsData[i]);
            if ((i + 1) % 4 === 0 && i !== allPostsData.length - 1) {
                // Récupérer un post publicitaire (ads) aléatoire depuis la table adsrandom
                const { data: adsData, error: adsError } = await supabase
                    .from('ads_random')
                    .select('id, title, description, ad_type, src, uuid, website, country')
                    .limit(1);

                if (adsError) {
                    console.error('Erreur lors de la récupération du post publicitaire depuis Supabase:', adsError.message);
                    return res.status(500).send(adsError);
                }

                const adData = adsData[0]; // Récupérer les données du post publicitaire

                // Récupérer les informations de l'utilisateur qui a posté le post publicitaire
                const { data: userData, error: userError } = await supabase
                    .from('users_infos')
                    .select('username, avatar, badge') // Ajouter les champs que vous souhaitez récupérer
                    .eq('uuid', adData.uuid)
                    .single();

                if (userError) {
                    console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                    return res.status(500).send('Erreur lors de la récupération des informations utilisateur depuis Supabase.');
                }

                // Ajouter les informations de l'utilisateur à l'annonce publicitaire
                postsWithAds.push({
                    id: adData.id,
                    uuid: adData.uuid,
                    title: adData.title,
                    content: adData.description,
                    type: adData.ad_type,
                    url: adData.URL,
                    website: adData.website,
                    user: {uuid: userData.uuid, username: userData.username, avatar: userData.avatar, badge: userData.badge }
                });
            }
        }


        res.status(200).json({ posts: postsWithAds });
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});




app.get('/exploare', async (req, res) => {
  try {
    // Sélectionner tous les posts avec les informations de l'utilisateur associé
    const { data, error } = await supabase
      .from('posts')
      .select(`uuid, src`)
      .eq('type', 'post')

    if (error) {
      throw error;
    }

    // Retourner les données avec les informations utilisateur
    res.status(200).json(data);
  } catch (error) {
    console.error('Erreur lors de la récupération des posts :', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts' });
  }
});


app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Fetcher les utilisateurs suivis par `fromId` depuis la table `follow`
    let { data: follows, error: followError } = await supabase
      .from('follow')
      .select('toid, closed_friend')
      .eq('fromid', userId);

    if (followError) throw followError;

    // 2. Extraire les `toId` pour récupérer les informations des utilisateurs suivis
    const toIds = follows.map(follow => follow.toid);

    // 3. Fetcher les informations des utilisateurs suivis depuis la table `users_infos`
    let { data: users, error: userError } = await supabase
      .from('users_infos')
      .select('userId, avatar, username')
      .in('uuid', toIds);  // Remplacer `uuid` par `userId` pour correspondre avec `toid`

    if (userError) throw userError;

    // 4. Associer `closed_friend` à chaque utilisateur
    const usersWithFriendsStatus = users.map(user => {
      const follow = follows.find(f => f.toid === user.userId); // Trouver l'entrée correspondante dans `follows`
      return {
        ...user,
        closed_friend: follow ? follow.closed_friend : false  // Ajouter `closed_friend` à chaque utilisateur
      };
    });

    // 5. Retourner la réponse avec les informations des utilisateurs suivis et `closed_friend`
    res.status(200).json(usersWithFriendsStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




app.get('/api/comments/:postId', async (req, res) => {
    try {
        const postId = req.params.postId;
        

        const {data: CommentsData, error: CommentsError} = await supabase.from('comments').select('id, comment, uuid').eq('post_id', postId);

        if (CommentsError) {
            console.error('Erreur lors de la récupération des comments depuis Supabase:', CommentsError.message);
            return res.status(500).send('Erreur lors de la récupération des comments depuis Supabase.');
        }

        const usersInfoPromises = CommentsData.map(async comment => {
            const { data: userInfo, error: userError } = await supabase
                .from('users_infos')
                .select('username, avatar, badge')
                .eq('uuid', comment.uuid)
                .single();

            if (userError) {
                console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                return null; // Ignorer cet utilisateur s'il y a une erreur
            }

            return { username: userInfo.username, avatar: userInfo.avatar, badge: userInfo.badge };
        });

        const usersInfoResults = await Promise.all(usersInfoPromises);
        // Ajouter les informations de l'utilisateur à chaque post

        CommentsData.forEach((comment, index) => {
            comment.user = usersInfoResults[index];
        });

        res.status(200).json({ comments: CommentsData });
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});



app.listen(3000, () => console.log('Server is listening on port 3000 🚀'));
